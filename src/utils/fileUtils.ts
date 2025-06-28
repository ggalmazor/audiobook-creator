export interface MP3File {
  name: string
  path: string
  size: number
}

export function deduplicateFiles(existingFiles: MP3File[], newFiles: MP3File[]): MP3File[] {
  const existingPaths = new Set(existingFiles.map(f => f.path))
  return newFiles.filter(file => !existingPaths.has(file.path))
}