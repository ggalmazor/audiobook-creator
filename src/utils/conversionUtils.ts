/**
 * Utilities for audio conversion validation and FFmpeg command generation
 */

/**
 * Validates the input parameters for audio conversion
 * @param mp3Files Array of MP3 file paths
 * @param outputPath Output path for the audiobook
 * @returns Error message if validation fails, null if valid
 */
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

/**
 * Generates FFmpeg command arguments for converting MP3 files to M4B audiobook
 * @param mp3Files Array of MP3 file paths to concatenate
 * @param outputPath Output path for the M4B file
 * @param title Optional title metadata
 * @param author Optional author metadata
 * @returns Array of FFmpeg command arguments
 */
export function generateFFmpegArgs(
  mp3Files: string[],
  outputPath: string,
  title?: string,
  author?: string,
): string[] {
  const args = ["-y"] // Overwrite output file if it exists
  
  // Add input files
  for (const file of mp3Files) {
    args.push("-i", file)
  }
  
  // Add concat filter
  args.push("-filter_complex", `concat=n=${mp3Files.length}:v=0:a=1`)
  
  // Add encoding options
  args.push("-vn", "-c:a", "aac", "-b:a", "64k")
  
  // Add metadata
  if (title) {
    args.push("-metadata", `title=${title}`)
  }
  if (author) {
    args.push("-metadata", `artist=${author}`)
  }
  args.push("-metadata", "genre=Audiobook")
  
  // Add output file
  const outputFile = outputPath.endsWith(".m4b") ? outputPath : `${outputPath}.m4b`
  args.push(outputFile)
  
  return args
}