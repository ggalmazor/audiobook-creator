
use std::fs::File;
use std::path::Path;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::get_probe;

#[derive(serde::Serialize, serde::Deserialize)]
struct ConversionProgress {
    current_file: usize,
    total_files: usize,
    current_file_name: String,
    percentage: f32,
}

fn get_mp3_duration(file_path: &str) -> Result<f64, String> {
    let path = Path::new(file_path);
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("mp3");
    
    let meta_opts: MetadataOptions = Default::default();
    let mut probed = get_probe()
        .format(&hint, mss, &Default::default(), &meta_opts)
        .map_err(|e| format!("Failed to probe file: {}", e))?;
    
    let track = probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("No valid audio track found")?;
    
    let time_base = track.codec_params.time_base;
    let n_frames = track.codec_params.n_frames;
    
    match (time_base, n_frames) {
        (Some(tb), Some(frames)) => {
            let duration = frames as f64 * tb.numer as f64 / tb.denom as f64;
            Ok(duration)
        }
        _ => Err("Could not determine duration".to_string()),
    }
}

#[tauri::command]
async fn get_mp3_durations(mp3_files: Vec<String>) -> Result<Vec<f64>, String> {
    let mut durations = Vec::new();
    
    for file_path in mp3_files {
        let duration = get_mp3_duration(&file_path)?;
        durations.push(duration);
    }
    
    Ok(durations)
}

#[tauri::command]
async fn convert_with_ffmpeg_args(
    app_handle: tauri::AppHandle,
    ffmpeg_args: Vec<String>,
    metadata_file: Option<String>,
) -> Result<String, String> {
    if ffmpeg_args.is_empty() {
        return Err("No FFmpeg arguments provided".to_string());
    }

    // Try different FFmpeg command paths
    let command_names = ["ffmpeg-command", "ffmpeg-command-usr-local", "ffmpeg-command-usr"];
    let mut output = None;
    let mut last_error = String::new();

    for command_name in command_names.iter() {
        match tauri_plugin_shell::ShellExt::shell(&app_handle)
            .command(command_name)
            .args(&ffmpeg_args)
            .output()
            .await {
            Ok(result) => {
                output = Some(result);
                break;
            }
            Err(e) => {
                last_error = format!("Failed to execute FFmpeg with {}: {}", command_name, e);
                continue;
            }
        }
    }

    let output = output.ok_or_else(|| format!("FFmpeg not found in any expected location. Last error: {}", last_error))?;

    // Clean up temporary metadata file if it exists
    if let Some(metadata_path) = metadata_file {
        let _ = std::fs::remove_file(&metadata_path); // Ignore errors for cleanup
    }

    if output.status.success() {
        // Extract output file from args (should be the last argument)
        let default_name = "audiobook.m4b".to_string();
        let output_file = ffmpeg_args.last().unwrap_or(&default_name);
        Ok(format!("Audiobook created successfully: {}", output_file))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

#[tauri::command]
async fn convert_to_audiobook(
    app_handle: tauri::AppHandle,
    mp3_files: Vec<String>,
    output_path: String,
    title: Option<String>,
    author: Option<String>,
) -> Result<String, String> {
    if mp3_files.is_empty() {
        return Err("No MP3 files provided".to_string());
    }

    let output_file = if output_path.ends_with(".m4b") {
        output_path
    } else {
        format!("{}.m4b", output_path)
    };

    // Create FFmpeg command for concatenating MP3s and converting to M4B
    let mut ffmpeg_args = vec!["-y".to_string()]; // -y to overwrite output file

    // Add input files
    for file in &mp3_files {
        ffmpeg_args.push("-i".to_string());
        ffmpeg_args.push(file.clone());
    }

    // Create filter complex for concatenation (audio only)
    let filter_complex = format!("concat=n={}:v=0:a=1", mp3_files.len());
    ffmpeg_args.extend([
        "-filter_complex".to_string(),
        filter_complex,
        "-vn".to_string(),  // No video
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "64k".to_string(),
    ]);

    // Add metadata
    if let Some(title) = title {
        ffmpeg_args.extend(["-metadata".to_string(), format!("title={}", title)]);
    }
    if let Some(author) = author {
        ffmpeg_args.extend(["-metadata".to_string(), format!("artist={}", author)]);
    }

    // Add genre metadata for audiobook
    ffmpeg_args.extend([
        "-metadata".to_string(),
        "genre=Audiobook".to_string(),
        output_file.clone(),
    ]);

    // Try different FFmpeg command paths
    let command_names = ["ffmpeg-command", "ffmpeg-command-usr-local", "ffmpeg-command-usr"];
    let mut output = None;
    let mut last_error = String::new();

    for command_name in command_names.iter() {
        match tauri_plugin_shell::ShellExt::shell(&app_handle)
            .command(command_name)
            .args(&ffmpeg_args)
            .output()
            .await {
            Ok(result) => {
                output = Some(result);
                break;
            }
            Err(e) => {
                last_error = format!("Failed to execute FFmpeg with {}: {}", command_name, e);
                continue;
            }
        }
    }

    let output = output.ok_or_else(|| format!("FFmpeg not found in any expected location. Last error: {}", last_error))?;

    if output.status.success() {
        Ok(format!("Audiobook created successfully: {}", output_file))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![convert_to_audiobook, convert_with_ffmpeg_args, get_mp3_durations])
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
