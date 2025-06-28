use tauri::Manager;
use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize)]
struct ConversionProgress {
    current_file: usize,
    total_files: usize,
    current_file_name: String,
    percentage: f32,
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

    // Execute FFmpeg command
    let output = tauri_plugin_shell::ShellExt::shell(&app_handle)
        .command("ffmpeg")
        .args(&ffmpeg_args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

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
    .invoke_handler(tauri::generate_handler![convert_to_audiobook])
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
