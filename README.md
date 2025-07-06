# Audiobook Creator

A desktop application for converting MP3 files into M4B audiobook format with chapters, metadata, and cover art.

## Features

> [!INFO]
> This app assumes `ffmpeg` and `ffprobe` commands are available in the PATH

### Core Functionality
- **MP3 to M4B Conversion**: Convert multiple MP3 files into a single M4B audiobook
- **Automatic Chapters**: Each MP3 file becomes a chapter with proper timing
- **Metadata-extraction**: Automatically extracts title and author from MP3 files
- **Cover Art extraction**: Attempts to extract embedded cover art from MP3 files

## How to Use

### Getting Started
1. **Launch the app** - The main interface will appear with a drop zone
2. **Add MP3 files** using either method:
   - Drag & drop MP3 files from Finder/Explorer into the drop zone
   - Click the drop zone to open a file browser
3. **Arrange chapters** - Drag files up or down to reorder them
4. **Review metadata** - Check the auto-detected title and author
5. **Customize if needed**:
   - Edit the title and author fields
   - Add or replace the cover image
   - Preview the total duration
6. **Start conversion** - Click "Convert to M4B"
7. **Choose output location** - Select where to save your audiobook
8. **Monitor progress** - Watch the real-time conversion progress
9. **Toggle console** - Click "Show/Hide Console" to see detailed FFmpeg output

## Technology Stack

- **Tauri v2**: Rust-based framework for building desktop applications
- **Webview**: Uses the system's native webview for the UI layer
- **Cross-platform**: Runs on macOS, Windows, and Linux
- **Preact**: Lightweight React alternative for the user interface
- **TypeScript**: Type-safe JavaScript for better development experience
- **Vite**: Fast build tool and development server
- **Deno**: Modern JavaScript/TypeScript runtime
- **FFmpeg**: Industry-standard tool for audio/video processing
- **FFprobe**: Metadata extraction and file analysis

## How It Works

### Conversion Process
1. **File Analysis**: Uses FFprobe to extract duration and metadata from each MP3
2. **Chapter Creation**: Calculates start/end times for each chapter based on file durations
3. **Metadata File**: Generates FFmpeg-compatible metadata with chapter information
4. **Cover Processing**: Extracts or converts cover images to JPEG format for embedding
5. **FFmpeg Command**: Constructs and executes the final conversion command:
   ```bash
   ffmpeg -i file1.mp3 -i file2.mp3 ... -i metadata.txt -i cover.jpg \
          -filter_complex "concat=n=X:v=0:a=1" \
          -map_metadata N -map N+1:v -c:v mjpeg -disposition:v attached_pic \
          -c:a aac -b:a 64k output.m4b
   ```
## Development

### Prerequisites

This project uses ASDF to manage development tools.

- **Rust**: Latest stable version with Cargo
- **Deno**: v2.0+ for the frontend development
- **FFmpeg & FFprobe**: v7.1.1+ available in system PATH

### Running Locally
```bash
deno run -WRENS tauri dev
```

### Building
```bash
deno run -WRENS tauri build
```

### Project Structure
```
<root>/
├── src/                 # Frontend source code (Preact/TypeScript)
│   ├── components/      # Reusable UI components
│   ├── utils/           # Utility functions
│   └── types/           # TypeScript type definitions
├── src-tauri/           # Backend source code (Rust)
│   ├── src/             # Rust application logic
│   └── capabilities/    # Tauri permissions configuration
└── dist/                # Built frontend assets
```

### Debug Information
The app includes built-in logging that shows:
- File drop events and processing
- Metadata extraction results
- Conversion progress and errors
- System capability checks

### Getting Help
If you encounter issues:
1. Check the console output during conversion
2. Verify FFmpeg installation: `ffmpeg -version`
3. Ensure MP3 files are not corrupted
4. Try with a smaller test set of files first
