import type { MP3File } from '../types/index.ts'

export function deduplicateFiles(existingFiles: MP3File[], newFiles: MP3File[]): MP3File[] {
  const existingPaths = new Set(existingFiles.map(f => f.path))
  return newFiles.filter(file => !existingPaths.has(file.path))
}