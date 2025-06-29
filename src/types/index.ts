export interface MP3File {
  name: string
  path: string
  size: number
}

export type Route = 'main' | 'conversion'

export interface AppState {
  mp3Files: MP3File[]
  title: string
  author: string
  coverImage: string | null
  coverImagePath: string | null
  isAutoDetectedCover: boolean
  conversionProgress: string
  realtimeOutput: string[]
  showCommandOutput: boolean
}