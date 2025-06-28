interface ChapterInfo {
  title: string
  start: number
  end: number
}

import { invoke } from '@tauri-apps/api/core'

export async function generateChapterMetadata(mp3Files: string[]): Promise<string> {
  // Use Rust backend to get durations for all files efficiently
  const durations = await invoke('get_mp3_durations', { mp3Files }) as number[]
  
  const chapters: ChapterInfo[] = []
  let currentTime = 0

  for (let i = 0; i < mp3Files.length; i++) {
    const duration = durations[i]
    const fileName = mp3Files[i].split('/').pop()?.replace('.mp3', '') || `Chapter ${i + 1}`
    
    chapters.push({
      title: fileName,
      start: currentTime,
      end: currentTime + duration
    })
    
    currentTime += duration
  }

  let metadata = ';FFMETADATA1\n'
  
  chapters.forEach((chapter, index) => {
    metadata += `[CHAPTER]\n`
    metadata += `TIMEBASE=1/1000\n`
    metadata += `START=${Math.round(chapter.start * 1000)}\n`
    metadata += `END=${Math.round(chapter.end * 1000)}\n`
    metadata += `title=${chapter.title}\n`
  })

  return metadata
}

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

export async function generateFFmpegArgs(mp3Files: string[], outputPath: string, title?: string, author?: string): Promise<{ args: string[], metadataFile?: string }> {
  const args = ['-y'] // Overwrite output file

  // Generate chapter metadata
  const chapterMetadata = await generateChapterMetadata(mp3Files)
  
  // Create temporary metadata file
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  const { tempDir } = await import('@tauri-apps/api/path')
  const tempDirPath = await tempDir()
  const metadataFile = `${tempDirPath}/ffmetadata_${Date.now()}.txt`
  
  await writeTextFile(metadataFile, chapterMetadata)

  // Add metadata file as input
  args.push('-i', metadataFile)

  // Add input files
  for (const file of mp3Files) {
    args.push('-i', file)
  }

  // Create filter complex for concatenation (audio only)
  const filterComplex = `concat=n=${mp3Files.length}:v=0:a=1`
  args.push('-filter_complex', filterComplex)

  // Audio encoding settings (no video)
  args.push('-vn', '-c:a', 'aac', '-b:a', '64k')

  // Map metadata from the first input (metadata file)
  args.push('-map_metadata', '0')

  // Add additional metadata
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

  return { args, metadataFile }
}