
use std::io::{Write, BufRead, BufReader};
use std::process::{Command, Stdio};
use tempfile::NamedTempFile;
use tauri::Emitter;

/// Chapter information for audiobook metadata
#[derive(Debug, Clone)]
struct ChapterInfo {
    title: String,
    start_time: f64,
    duration: f64,
}

/// Get the duration of an MP3 file using ffprobe
async fn get_mp3_duration_ffprobe(file_path: &str) -> Result<f64, String> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-i", file_path,
            "-show_entries", "format=duration",
            "-v", "quiet",
            "-of", "csv=p=0"
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {}", stderr));
    }
    
    let duration_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    duration_str.parse::<f64>()
        .map_err(|e| format!("Failed to parse duration '{}': {}", duration_str, e))
}

/// Tauri command to get durations of multiple MP3 files
/// Used by the frontend to calculate total audiobook duration
#[tauri::command]
async fn get_mp3_durations(mp3_files: Vec<String>) -> Result<Vec<f64>, String> {
    let mut durations = Vec::new();
    
    for file_path in mp3_files {
        let duration = get_mp3_duration_ffprobe(&file_path).await?;
        durations.push(duration);
    }
    
    Ok(durations)
}

/// Tauri command to convert MP3 files to M4B audiobook with chapters
/// This is the main conversion function used by the frontend
#[tauri::command]
async fn convert_to_m4b_native(
    app_handle: tauri::AppHandle,
    mp3_files: Vec<String>,
    output_path: String,
    title: Option<String>,
    author: Option<String>,
    cover_image: Option<String>,
) -> Result<String, String> {
    if mp3_files.is_empty() {
        return Err("No MP3 files provided".to_string());
    }

    let output_file = if output_path.ends_with(".m4b") {
        output_path
    } else {
        format!("{}.m4b", output_path)
    };

    // Create chapter metadata for FFmpeg
    let mut chapters = Vec::new();
    let mut current_time = 0.0;

    for (i, file_path) in mp3_files.iter().enumerate() {
        let duration = get_mp3_duration_ffprobe(file_path).await?;
        
        let file_name = file_path.split('/').last().unwrap_or(&format!("Chapter {}", i + 1))
            .replace(".mp3", "");
        
        chapters.push(ChapterInfo {
            title: file_name,
            start_time: current_time,
            duration,
        });
        
        current_time += duration;
    }

    // Create temporary chapter metadata file
    let mut metadata_file = NamedTempFile::new()
        .map_err(|e| format!("Failed to create temp metadata file: {}", e))?;
    
    writeln!(metadata_file, ";FFMETADATA1")
        .map_err(|e| format!("Failed to write metadata header: {}", e))?;
    
    if let Some(title) = &title {
        writeln!(metadata_file, "title={}", title)
            .map_err(|e| format!("Failed to write title: {}", e))?;
    }
    if let Some(author) = &author {
        writeln!(metadata_file, "artist={}", author)
            .map_err(|e| format!("Failed to write artist: {}", e))?;
    }
    writeln!(metadata_file, "genre=Audiobook")
        .map_err(|e| format!("Failed to write genre: {}", e))?;
    
    // Add chapters
    for (_i, chapter) in chapters.iter().enumerate() {
        let start_ms = (chapter.start_time * 1000.0) as u64;
        let end_ms = ((chapter.start_time + chapter.duration) * 1000.0) as u64;
        
        writeln!(metadata_file, "")
            .map_err(|e| format!("Failed to write chapter separator: {}", e))?;
        writeln!(metadata_file, "[CHAPTER]")
            .map_err(|e| format!("Failed to write chapter header: {}", e))?;
        writeln!(metadata_file, "TIMEBASE=1/1000")
            .map_err(|e| format!("Failed to write timebase: {}", e))?;
        writeln!(metadata_file, "START={}", start_ms)
            .map_err(|e| format!("Failed to write start time: {}", e))?;
        writeln!(metadata_file, "END={}", end_ms)
            .map_err(|e| format!("Failed to write end time: {}", e))?;
        writeln!(metadata_file, "title={}", chapter.title)
            .map_err(|e| format!("Failed to write chapter title: {}", e))?;
    }
    
    metadata_file.flush()
        .map_err(|e| format!("Failed to flush metadata file: {}", e))?;
    
    // Build FFmpeg command
    let mut ffmpeg_args = vec!["-y".to_string()]; // overwrite output
    
    // Add input files
    for file in &mp3_files {
        ffmpeg_args.push("-i".to_string());
        ffmpeg_args.push(file.clone());
    }
    
    // Add metadata file
    ffmpeg_args.push("-i".to_string());
    ffmpeg_args.push(metadata_file.path().to_string_lossy().to_string());
    
    // Add cover image if provided
    let has_cover = cover_image.is_some();
    if let Some(cover_path) = &cover_image {
        ffmpeg_args.push("-i".to_string());
        ffmpeg_args.push(cover_path.clone());
    }
    
    // Add concat filter and encoding options
    let filter_complex = format!("concat=n={}:v=0:a=1", mp3_files.len());
    ffmpeg_args.extend([
        "-filter_complex".to_string(),
        filter_complex,
        "-map_metadata".to_string(),
        format!("{}", mp3_files.len()), // metadata from last input
    ]);
    
    // Add cover image mapping if provided
    if has_cover {
        ffmpeg_args.extend([
            "-map".to_string(),
            format!("{}:v", mp3_files.len() + 1), // cover image stream
            "-c:v".to_string(),
            "mjpeg".to_string(), // JPEG codec for cover
            "-disposition:v".to_string(),
            "attached_pic".to_string(), // Mark as attached picture
        ]);
    }
    
    ffmpeg_args.extend([
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "64k".to_string(),
        output_file.clone(),
    ]);
    
    // Execute FFmpeg with streaming output
    app_handle.emit("conversion-output", format!("Executing: ffmpeg {}", ffmpeg_args.join(" ")))
        .map_err(|e| format!("Failed to emit command: {}", e))?;
    
    let mut child = Command::new("ffmpeg")
        .args(&ffmpeg_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
    
    // Stream stderr output (FFmpeg writes progress to stderr)
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let _ = app_handle.emit("conversion-output", &line);
                }
                Err(_) => break,
            }
        }
    }
    
    let status = child.wait()
        .map_err(|e| format!("Failed to wait for ffmpeg: {}", e))?;
    
    if !status.success() {
        return Err("FFmpeg process failed".to_string());
    }

    let success_msg = if has_cover {
        format!("Audiobook created successfully: {} with {} chapters and cover art", output_file, chapters.len())
    } else {
        format!("Audiobook created successfully: {} with {} chapters", output_file, chapters.len())
    };
    let _ = app_handle.emit("conversion-output", &success_msg);
    Ok(success_msg)
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![get_mp3_durations, convert_to_m4b_native])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
