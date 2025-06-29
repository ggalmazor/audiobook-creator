import { useState } from 'preact/hooks'
import type { MP3File } from '../types/index.ts'
import { FileList } from './FileList.tsx'
import { MetadataForm } from './MetadataForm.tsx'

interface MainViewProps {
  mp3Files: MP3File[]
  setMp3Files: (files: MP3File[]) => void
  title: string
  author: string
  coverImage: string | null
  coverImagePath: string | null
  isAutoDetectedCover: boolean
  isConverting: boolean
  conversionProgress: string
  commandOutput: string
  showCommandOutput: boolean
  onTitleChange: (title: string) => void
  onAuthorChange: (author: string) => void
  onCoverChange: (cover: string | null, path: string | null, isAutoDetected: boolean) => void
  onToggleCommandOutput: () => void
  onConvert: () => void
}

export function MainView({
  mp3Files,
  setMp3Files,
  title,
  author,
  coverImage,
  coverImagePath,
  isAutoDetectedCover,
  isConverting,
  conversionProgress,
  commandOutput,
  showCommandOutput,
  onTitleChange,
  onAuthorChange,
  onCoverChange,
  onToggleCommandOutput,
  onConvert
}: MainViewProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleMetadataExtracted = (
    extractedTitle: string | null,
    extractedAuthor: string | null,
    extractedCover: string | null
  ) => {
    if (extractedTitle && !title) {
      onTitleChange(extractedTitle)
    }
    if (extractedAuthor && !author) {
      onAuthorChange(extractedAuthor)
    }
    if (extractedCover && !coverImage) {
      onCoverChange(extractedCover, null, true)
    }
  }

  return (
    <div class="app">
      <div class="app-header">
        <h1>Audiobook Creator</h1>
        {(conversionProgress || commandOutput) && (
          <div class="progress-section">
            {conversionProgress && (
              <div class="progress-text">{conversionProgress}</div>
            )}
            {commandOutput && (
              <div class="output-section">
                <button 
                  class="toggle-output-btn"
                  onClick={onToggleCommandOutput}
                >
                  {showCommandOutput ? '🔽' : '▶️'} Output
                </button>
                {showCommandOutput && (
                  <div class="command-output">
                    {commandOutput}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div class="app-content">
        <div class="left-panel">
          <FileList
            mp3Files={mp3Files}
            setMp3Files={setMp3Files}
            onMetadataExtracted={handleMetadataExtracted}
            isConverting={isConverting}
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
            draggedIndex={draggedIndex}
            setDraggedIndex={setDraggedIndex}
          />
        </div>

        <MetadataForm
          title={title}
          author={author}
          coverImage={coverImage}
          coverImagePath={coverImagePath}
          isAutoDetectedCover={isAutoDetectedCover}
          mp3Files={mp3Files}
          isConverting={isConverting}
          onTitleChange={onTitleChange}
          onAuthorChange={onAuthorChange}
          onCoverChange={onCoverChange}
          onConvert={onConvert}
        />
      </div>
    </div>
  )
}