// Simplified validation since we're using native Rust conversion

export function validateConversionInputs(mp3Files: string[], outputPath: string): string | null {
  if (mp3Files.length === 0) {
    return 'No MP3 files provided'
  }

  if (!outputPath) {
    return 'Output path is required'
  }

  // Check if all files have .mp3 extension
  const invalidFiles = mp3Files.filter(file => !file.toLowerCase().endsWith('.mp3'))
  if (invalidFiles.length > 0) {
    return `Invalid files detected: ${invalidFiles.join(', ')}`
  }

  return null
}

