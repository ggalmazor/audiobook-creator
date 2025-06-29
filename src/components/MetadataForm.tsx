import type { MP3File } from '../types/index.ts'
import { CoverImage } from './CoverImage.tsx'

interface MetadataFormProps {
  title: string
  author: string
  coverImage: string | null
  coverImagePath: string | null
  isAutoDetectedCover: boolean
  mp3Files: MP3File[]
  isConverting: boolean
  onTitleChange: (title: string) => void
  onAuthorChange: (author: string) => void
  onCoverChange: (cover: string | null, path: string | null, isAutoDetected: boolean) => void
  onConvert: () => void
}

export function MetadataForm({
  title,
  author,
  coverImage,
  coverImagePath,
  isAutoDetectedCover,
  mp3Files,
  isConverting,
  onTitleChange,
  onAuthorChange,
  onCoverChange,
  onConvert
}: MetadataFormProps) {
  return (
    <div class="right-panel">
      <div class="metadata-form">
        <h3>Audiobook Details</h3>
        <div class="form-row">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onInput={(e) => onTitleChange((e.target as HTMLInputElement).value)}
            placeholder="Enter book title"
            disabled={isConverting}
          />
        </div>
        <div class="form-row">
          <label htmlFor="author">Author</label>
          <input
            id="author"
            type="text"
            value={author}
            onInput={(e) => onAuthorChange((e.target as HTMLInputElement).value)}
            placeholder="Enter author name"
            disabled={isConverting}
          />
        </div>
        <div class="form-row">
          <label>Cover Image</label>
          <CoverImage
            coverImage={coverImage}
            coverImagePath={coverImagePath}
            isAutoDetectedCover={isAutoDetectedCover}
            isConverting={isConverting}
            onCoverChange={onCoverChange}
          />
        </div>
      </div>

      <button 
        class="convert-btn"
        onClick={onConvert}
        disabled={isConverting || mp3Files.length === 0}
      >
        {isConverting ? (
          <>
            <div class="spinner"></div>
            Converting...
          </>
        ) : 'Create Audiobook'}
      </button>
    </div>
  )
}