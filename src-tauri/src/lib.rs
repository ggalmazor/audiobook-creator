
use std::fs::File;
use std::path::Path;
use std::io::{Write, Seek, SeekFrom, BufWriter};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::default::{get_probe, get_codecs};
use symphonia::core::formats::FormatOptions;
use mp4::{Mp4Writer, Mp4Config, TrackConfig, AacConfig, MediaConfig};
use tempfile::NamedTempFile;

#[derive(serde::Serialize, serde::Deserialize)]
struct ConversionProgress {
    current_file: usize,
    total_files: usize,
    current_file_name: String,
    percentage: f32,
}

#[derive(Debug, Clone)]
struct ChapterInfo {
    title: String,
    start_time: f64,  // in seconds
    duration: f64,    // in seconds
    start_sample: usize,
    end_sample: usize,
}

fn get_mp3_duration(file_path: &str) -> Result<f64, String> {
    let path = Path::new(file_path);
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("mp3");
    
    let meta_opts: MetadataOptions = Default::default();
    let probed = get_probe()
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

fn decode_mp3_to_samples(file_path: &str) -> Result<(Vec<f32>, u32, u32), String> {
    let path = Path::new(file_path);
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("mp3");
    
    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();
    
    let probed = get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Failed to probe file: {}", e))?;
    
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("No valid audio track found")?;
    
    let track_id = track.id;
    let mut decoder = get_codecs()
        .make(&track.codec_params, &Default::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;
    
    let mut samples = Vec::new();
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2) as u32;
    
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(_) => break,
        };
        
        if packet.track_id() != track_id {
            continue;
        }
        
        match decoder.decode(&packet) {
            Ok(audio_buf) => {
                // Convert audio buffer to f32 samples
                match audio_buf {
                    AudioBufferRef::F32(buf) => {
                        for &sample in buf.chan(0) {
                            samples.push(sample);
                        }
                    }
                    AudioBufferRef::S16(buf) => {
                        for &sample in buf.chan(0) {
                            samples.push(sample as f32 / 32768.0);
                        }
                    }
                    AudioBufferRef::S32(buf) => {
                        for &sample in buf.chan(0) {
                            samples.push(sample as f32 / 2147483648.0);
                        }
                    }
                    _ => return Err("Unsupported audio format".to_string()),
                }
            }
            Err(_) => continue,
        }
    }
    
    Ok((samples, sample_rate, channels))
}

fn create_m4b_with_chapters(
    samples: &[f32],
    sample_rate: u32,
    channels: u32,
    chapters: &[ChapterInfo],
    output_path: &str,
    title: Option<&str>,
    author: Option<&str>,
) -> Result<(), String> {
    // First create a temporary WAV file
    let temp_wav = NamedTempFile::new()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    
    let spec = hound::WavSpec {
        channels: channels as u16,
        sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let mut wav_writer = hound::WavWriter::create(temp_wav.path(), spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

    for &sample in samples {
        wav_writer.write_sample(sample)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }

    wav_writer.finalize()
        .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

    // Now create M4B file with chapter metadata
    let output_file = File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;

    let mut writer = BufWriter::new(output_file);

    // Create M4B container with metadata
    create_m4b_container(&mut writer, temp_wav.path(), chapters, title, author)?;

    Ok(())
}

fn create_m4b_container(
    writer: &mut BufWriter<File>,
    wav_path: &Path,
    chapters: &[ChapterInfo],
    title: Option<&str>,
    author: Option<&str>,
) -> Result<(), String> {
    // For now, let's create a simple M4A structure and add chapter metadata
    // This is a simplified implementation - a full M4B would need proper AAC encoding
    
    // Read the WAV file
    let wav_data = std::fs::read(wav_path)
        .map_err(|e| format!("Failed to read WAV data: {}", e))?;
    
    // Write basic M4A structure with metadata
    write_m4a_header(writer, wav_data.len() as u64, title, author, chapters)?;
    
    // For now, we'll embed the WAV data (this should be AAC in a real implementation)
    writer.write_all(&wav_data)
        .map_err(|e| format!("Failed to write audio data: {}", e))?;
    
    Ok(())
}

fn write_m4a_header(
    writer: &mut BufWriter<File>,
    data_size: u64,
    title: Option<&str>,
    author: Option<&str>,
    chapters: &[ChapterInfo],
) -> Result<(), String> {
    // This is a simplified M4A header - in a real implementation we'd use proper MP4 boxes
    
    // Write basic ftyp box
    let ftyp = b"M4A ";
    writer.write_all(&(20u32).to_be_bytes())  // box size
        .map_err(|e| format!("Failed to write ftyp size: {}", e))?;
    writer.write_all(b"ftyp")  // box type
        .map_err(|e| format!("Failed to write ftyp: {}", e))?;
    writer.write_all(ftyp)  // major brand
        .map_err(|e| format!("Failed to write brand: {}", e))?;
    writer.write_all(&0u32.to_be_bytes())  // minor version
        .map_err(|e| format!("Failed to write version: {}", e))?;
    writer.write_all(ftyp)  // compatible brand
        .map_err(|e| format!("Failed to write compatible brand: {}", e))?;
    
    // Write metadata with chapters
    write_metadata_with_chapters(writer, title, author, chapters)?;
    
    Ok(())
}

fn write_metadata_with_chapters(
    writer: &mut BufWriter<File>,
    title: Option<&str>,
    author: Option<&str>,
    chapters: &[ChapterInfo],
) -> Result<(), String> {
    // Write chapter list as metadata
    let mut metadata = String::new();
    
    if let Some(t) = title {
        metadata.push_str(&format!("Title: {}\n", t));
    }
    if let Some(a) = author {
        metadata.push_str(&format!("Author: {}\n", a));
    }
    
    metadata.push_str("Chapters:\n");
    for (i, chapter) in chapters.iter().enumerate() {
        metadata.push_str(&format!(
            "Chapter {}: {} ({}s - {}s)\n", 
            i + 1, 
            chapter.title, 
            chapter.start_time, 
            chapter.start_time + chapter.duration
        ));
    }
    
    let metadata_bytes = metadata.as_bytes();
    
    // Write metadata box
    writer.write_all(&((8 + metadata_bytes.len()) as u32).to_be_bytes())
        .map_err(|e| format!("Failed to write metadata size: {}", e))?;
    writer.write_all(b"meta")
        .map_err(|e| format!("Failed to write meta box: {}", e))?;
    writer.write_all(metadata_bytes)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn convert_to_m4b_native(
    mp3_files: Vec<String>,
    output_path: String,
    title: Option<String>,
    author: Option<String>,
) -> Result<String, String> {
    if mp3_files.is_empty() {
        return Err("No MP3 files provided".to_string());
    }

    let mut all_samples = Vec::new();
    let mut sample_rate = 44100u32;
    let mut channels = 2u32;
    let mut chapters = Vec::new();
    let mut current_time = 0.0;
    let mut current_sample = 0;

    // Decode and concatenate all MP3 files, building chapter info
    for (i, file_path) in mp3_files.iter().enumerate() {
        let duration = get_mp3_duration(file_path)?;
        let (samples, sr, ch) = decode_mp3_to_samples(file_path)?;
        
        if i == 0 {
            sample_rate = sr;
            channels = ch;
        }
        
        // Create chapter info
        let file_name = file_path.split('/').last().unwrap_or(&format!("Chapter {}", i + 1))
            .replace(".mp3", "");
        
        chapters.push(ChapterInfo {
            title: file_name,
            start_time: current_time,
            duration,
            start_sample: current_sample,
            end_sample: current_sample + samples.len(),
        });
        
        all_samples.extend(samples);
        current_time += duration;
        current_sample = all_samples.len();
    }

    // Ensure output has .m4b extension
    let output_file = if output_path.ends_with(".m4b") { 
        output_path 
    } else { 
        format!("{}.m4b", output_path) 
    };

    // Create M4B with chapters
    create_m4b_with_chapters(
        &all_samples,
        sample_rate,
        channels,
        &chapters,
        &output_file,
        title.as_deref(),
        author.as_deref(),
    )?;

    Ok(format!("Audiobook created successfully: {} with {} chapters", output_file, chapters.len()))
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
    .invoke_handler(tauri::generate_handler![convert_to_audiobook, convert_with_ffmpeg_args, get_mp3_durations, convert_to_m4b_native])
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
