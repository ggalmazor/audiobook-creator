import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

interface CoverImageProps {
  coverImage: string | null
  coverImagePath: string | null
  isAutoDetectedCover: boolean
  isConverting: boolean
  onCoverChange: (cover: string | null, path: string | null, isAutoDetected: boolean) => void
}

export function CoverImage({
  coverImage,
  coverImagePath,
  isAutoDetectedCover,
  isConverting,
  onCoverChange
}: CoverImageProps) {
  const handleCoverSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Image Files',
          extensions: ['jpg', 'jpeg', 'png', 'webp']
        }]
      })
      
      if (selected && typeof selected === 'string') {
        try {
          // Convert the selected image to a data URL for reliable preview
          const dataUrl = await invoke('convert_image_to_data_url', { imagePath: selected })
          onCoverChange(dataUrl as string, selected, false)
        } catch (error) {
          console.error('Failed to convert image to data URL:', error)
          // Fallback to original path
          onCoverChange(selected, selected, false)
        }
      }
    } catch (error) {
      console.error('Error selecting cover image:', error)
    }
  }

  const removeCover = () => {
    onCoverChange(null, null, false)
  }

  if (!coverImage) {
    return (
      <button 
        class="select-cover-btn"
        onClick={handleCoverSelect}
        disabled={isConverting}
      >
        Select Cover Image
      </button>
    )
  }

  return (
    <div class="cover-preview">
      <img 
        src={coverImage}
        alt="Book cover" 
        class="cover-image"
        onError={(e) => {
          console.error('Image failed to load:', coverImage)
        }}
      />
      <div class="cover-info">
        <div class="cover-source">
          {isAutoDetectedCover ? (
            <span class="auto-detected">📖 Extracted from MP3</span>
          ) : (
            <span class="manually-selected">🖼️ Custom image</span>
          )}
        </div>
        <div class="cover-name">
          {isAutoDetectedCover ? 'Album artwork' : (coverImagePath?.split('/').pop() || 'Custom image')}
        </div>
        <div class="cover-actions">
          <button 
            class="replace-cover-btn"
            onClick={handleCoverSelect}
            disabled={isConverting}
          >
            Replace
          </button>
          <button 
            class="remove-cover-btn"
            onClick={removeCover}
            disabled={isConverting}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}