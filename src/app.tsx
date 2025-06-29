import './app.css'
import { useState, useRef, useEffect } from 'preact/hooks'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { convertFileSrc } from '@tauri-apps/api/core'
import { deduplicateFiles, type MP3File } from './utils/fileUtils.ts'
import { validateConversionInputs } from './utils/conversionUtils.ts'

// Helper function to format duration in hours, minutes, seconds
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  } else {
    return `${remainingSeconds}s`
  }
}

export function App() {
  const [mp3Files, setMp3Files] = useState<MP3File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [coverImagePath, setCoverImagePath] = useState<string | null>(null)
  const [isAutoDetectedCover, setIsAutoDetectedCover] = useState(false)
  const [conversionProgress, setConversionProgress] = useState('')
  const [showCommandOutput, setShowCommandOutput] = useState(false)
  const [commandOutput, setCommandOutput] = useState('')
  const [realtimeOutput, setRealtimeOutput] = useState<string[]>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const dragCounter = useRef(0)
  const outputRef = useRef<HTMLDivElement>(null)

  // Listen for real-time conversion output
  useEffect(() => {
    const unlisten = listen('conversion-output', (event) => {
      const output = event.payload as string
      setRealtimeOutput(prev => [...prev, output])
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
      }, 10)
    })

    return () => {
      unlisten.then(f => f())
    }
  }, [])

  const addUniqueFiles = async (newFiles: MP3File[]) => {
    setMp3Files(prev => {
      const uniqueFiles = deduplicateFiles(prev, newFiles)
      return [...prev, ...uniqueFiles]
    })
    
    // Extract metadata and cover from the first file if we're adding the first files
    if (mp3Files.length === 0 && newFiles.length > 0) {
      try {
        // Extract metadata (title and author)
        const metadata = await invoke('extract_mp3_metadata_command', { mp3File: newFiles[0].path })
        if (metadata && Array.isArray(metadata)) {
          const [extractedTitle, extractedAuthor] = metadata
          if (extractedTitle && !title) {
            setTitle(extractedTitle)
          }
          if (extractedAuthor && !author) {
            setAuthor(extractedAuthor)
          }
        }
      } catch (error) {
        console.log('No metadata found in first MP3 file:', error)
      }

      // Try to extract cover if no cover is set
      if (!coverImage) {
        try {
          const extractedCover = await invoke('extract_mp3_cover', { mp3File: newFiles[0].path })
          if (extractedCover && typeof extractedCover === 'string') {
            setCoverImage(extractedCover)
            setIsAutoDetectedCover(true)
          }
        } catch (error) {
          console.log('No cover art found in first MP3 file:', error)
        }
      }
    }
  }

  const handleFileSelect = async () => {
    console.log('File select clicked')
    try {
      console.log('Opening dialog...')
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'MP3 Audio',
          extensions: ['mp3']
        }]
      })
      
      console.log('Dialog result:', selected)
      
      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected]
        const newFiles: MP3File[] = files.map(path => ({
          name: path.split('/').pop() || path,
          path,
          size: 0
        }))
        await addUniqueFiles(newFiles)
      }
    } catch (error) {
      console.error('Error selecting files:', error)
    }
  }

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
          setCoverImage(dataUrl as string)
          setCoverImagePath(selected)
          setIsAutoDetectedCover(false)
        } catch (error) {
          console.error('Failed to convert image to data URL:', error)
          // Fallback to original path
          setCoverImage(selected)
          setCoverImagePath(selected)
          setIsAutoDetectedCover(false)
        }
      }
    } catch (error) {
      console.error('Error selecting cover image:', error)
    }
  }

  const removeCover = () => {
    setCoverImage(null)
    setCoverImagePath(null)
    setIsAutoDetectedCover(false)
  }

  const removeFile = (index: number) => {
    setMp3Files(prev => prev.filter((_, i) => i !== index))
  }

  const moveFile = (fromIndex: number, toIndex: number) => {
    setMp3Files(prev => {
      const newFiles = [...prev]
      const [moved] = newFiles.splice(fromIndex, 1)
      newFiles.splice(toIndex, 0, moved)
      return newFiles
    })
  }

  const handleDragStart = (e: any, index: number) => {
    setDraggedIndex(index)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', index.toString())
    }
  }

  const handleDragOver = (e: any, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      moveFile(draggedIndex, index)
      setDraggedIndex(index)
    }
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleDropZoneDragEnter = (e: any) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragOver(true)
  }

  const handleDropZoneDragOver = (e: any) => {
    e.preventDefault()
  }

  const handleDropZoneDragLeave = (e: any) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDropZoneDrop = async (e: any) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer?.files || []) as File[]
    const mp3Files = files.filter(file => file.name.toLowerCase().endsWith('.mp3'))
    
    const newFiles: MP3File[] = mp3Files.map(file => ({
      name: file.name,
      path: file.name,
      size: file.size
    }))
    
    await addUniqueFiles(newFiles)
  }

  const handleConvert = async () => {
    if (mp3Files.length === 0) {
      alert('Please select at least one MP3 file')
      return
    }

    try {
      // Generate default filename
      const defaultFilename = title && author 
        ? `${title} - ${author}.m4b`
        : title 
          ? `${title}.m4b`
          : 'audiobook.m4b'
      
      const outputPath = await save({
        defaultPath: defaultFilename,
        filters: [{
          name: 'M4B Audiobook',
          extensions: ['m4b']
        }]
      })

      if (!outputPath) return

      setIsConverting(true)
      setConversionProgress('Preparing conversion...')
      setCommandOutput('')
      setRealtimeOutput([])
      setShowCommandOutput(true) // Auto-show console during conversion
      
      const filePaths = mp3Files.map(f => f.path)
      
      // Validate inputs
      const validationError = validateConversionInputs(filePaths, outputPath)
      if (validationError) {
        setConversionProgress('Validation failed!')
        setCommandOutput(`❌ ${validationError}`)
        setIsConverting(false)
        return
      }

      setConversionProgress('Getting file durations...')
      
      try {
        // Get durations first for progress tracking
        const durations = await invoke('get_mp3_durations', { mp3Files: filePaths })
        const totalDuration = (durations as number[]).reduce((sum, duration) => sum + duration, 0)
        
        setConversionProgress(`Converting ${mp3Files.length} files (${formatDuration(totalDuration)})...`)
        
        // Use native Rust conversion with streaming output
        const result = await invoke('convert_to_m4b_native', {
          mp3Files: filePaths,
          outputPath,
          title: title || undefined,
          author: author || undefined,
          coverImage: coverImage || undefined
        })

        setConversionProgress('Conversion completed!')
        setCommandOutput(`✅ ${result}`)
        
        // Reset UI for new conversion after showing success
        setTimeout(() => {
          setConversionProgress('')
          setCommandOutput('')
          setRealtimeOutput([])
          setShowCommandOutput(false)
          // Clear everything for fresh start
          setMp3Files([])
          setCoverImage(null)
          setCoverImagePath(null)
          setIsAutoDetectedCover(false)
          setTitle('')
          setAuthor('')
        }, 3000)
      } catch (error) {
        setConversionProgress('Conversion failed!')
        setCommandOutput(`❌ Error: ${error}`)
        
        // Reset UI after showing error
        setTimeout(() => {
          setConversionProgress('')
          setCommandOutput('')
          setRealtimeOutput([])
          setShowCommandOutput(false)
          // Clear everything for fresh start
          setMp3Files([])
          setCoverImage(null)
          setCoverImagePath(null)
          setIsAutoDetectedCover(false)
          setTitle('')
          setAuthor('')
        }, 5000)
      }
    } catch (error) {
      setConversionProgress('Conversion failed!')
      setCommandOutput(`❌ Error: ${error}`)
      
      // Reset UI after showing error
      setTimeout(() => {
        setConversionProgress('')
        setCommandOutput('')
        setRealtimeOutput([])
        setShowCommandOutput(false)
        // Clear everything for fresh start
        setMp3Files([])
        setCoverImage(null)
        setCoverImagePath(null)
        setIsAutoDetectedCover(false)
        setTitle('')
        setAuthor('')
      }, 5000)
    } finally {
      setIsConverting(false)
    }
  }


  // Show conversion-focused UI during processing
  if (isConverting) {
    return (
      <div class="app conversion-mode">
        <div class="conversion-header">
          <h1>Converting Audiobook</h1>
          <div class="conversion-info">
            <div class="file-count">{mp3Files.length} files → {title || 'Untitled Audiobook'}</div>
          </div>
        </div>

        <div class="conversion-content">
          <div class="progress-section-large">
            <div class="spinner-large"></div>
            <div class="current-status">{conversionProgress}</div>
          </div>

          <div class="console-section">
            <div class="console-header">
              <button 
                class="toggle-console-btn"
                onClick={() => setShowCommandOutput(!showCommandOutput)}
              >
                {showCommandOutput ? '🔽' : '▶️'} Console Output
              </button>
            </div>
            {showCommandOutput && (
              <div class="console-output" ref={outputRef}>
                {realtimeOutput.map((line, index) => (
                  <div key={index} class="console-line">
                    {line}
                  </div>
                ))}
                {realtimeOutput.length === 0 && (
                  <div class="console-placeholder">Waiting for output...</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Regular UI when not converting
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
                  onClick={() => setShowCommandOutput(!showCommandOutput)}
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
          {mp3Files.length === 0 ? (
            <div 
              class={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
              onDragEnter={handleDropZoneDragEnter}
              onDragOver={handleDropZoneDragOver}
              onDragLeave={handleDropZoneDragLeave}
              onDrop={handleDropZoneDrop}
              onClick={handleFileSelect}
            >
              <div class="drop-zone-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                  <circle cx="12" cy="15" r="3"/>
                  <path d="M12 12v6"/>
                </svg>
                <p>Drop MP3 files here or click to select</p>
                <p class="hint">Files will be converted in the order you arrange them</p>
              </div>
            </div>
          ) : (
            <div class="file-list">
              <div class="file-list-header">
                <h3>Files ({mp3Files.length})</h3>
                <button class="add-files-btn" onClick={handleFileSelect}>+ Add</button>
              </div>
              <div class="files-scroll">
                {mp3Files.map((file, index) => (
                  <div 
                    key={`${file.path}-${index}`}
                    class={`file-item ${draggedIndex === index ? 'dragging' : ''}`}
                    draggable={!isConverting}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <div class="drag-handle">⋮⋮</div>
                    <div class="file-info">
                      <div class="file-name">{file.name}</div>
                      {file.size > 0 && (
                        <div class="file-size">
                          {(file.size / 1024 / 1024).toFixed(1)} MB
                        </div>
                      )}
                    </div>
                    <button 
                      class="remove-btn"
                      onClick={() => removeFile(index)}
                      disabled={isConverting}
                      aria-label="Remove file"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div class="right-panel">
          <div class="metadata-form">
            <h3>Audiobook Details</h3>
            <div class="form-row">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                type="text"
                value={title}
                onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
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
                onInput={(e) => setAuthor((e.target as HTMLInputElement).value)}
                placeholder="Enter author name"
                disabled={isConverting}
              />
            </div>
            <div class="form-row">
              <label>Cover Image</label>
              {coverImage ? (
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
              ) : (
                <button 
                  class="select-cover-btn"
                  onClick={handleCoverSelect}
                  disabled={isConverting}
                >
                  Select Cover Image
                </button>
              )}
            </div>
          </div>

          <button 
            class="convert-btn"
            onClick={handleConvert}
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
      </div>
    </div>
  )
}
