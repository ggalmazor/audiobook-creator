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

export function generateFFmpegArgs(mp3Files: string[], outputPath: string, title?: string, author?: string): string[] {
  const args = ['-y'] // Overwrite output file

  // Add input files
  for (const file of mp3Files) {
    args.push('-i', file)
  }

  // Create filter complex for concatenation
  const filterComplex = `concat=n=${mp3Files.length}:v=0:a=1`
  args.push('-filter_complex', filterComplex)

  // Audio encoding settings
  args.push('-c:a', 'aac', '-b:a', '64k')

  // Add metadata
  if (title) {
    args.push('-metadata', `title=${title}`)
  }
  if (author) {
    args.push('-metadata', `artist=${author}`)
  }

  // Add audiobook genre
  args.push('-metadata', 'genre=Audiobook')

  // Output file
  const outputFile = outputPath.endsWith('.m4b') ? outputPath : `${outputPath}.m4b`
  args.push(outputFile)

  return args
}