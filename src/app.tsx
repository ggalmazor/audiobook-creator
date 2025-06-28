import './app.css'
import { useState } from 'preact/hooks'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { deduplicateFiles, type MP3File } from './utils/fileUtils.ts'
import { validateConversionInputs, generateFFmpegArgs } from './utils/conversionUtils.ts'

export function App() {
  const [mp3Files, setMp3Files] = useState<MP3File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')

  const addUniqueFiles = (newFiles: MP3File[]) => {
    setMp3Files(prev => {
      const uniqueFiles = deduplicateFiles(prev, newFiles)
      return [...prev, ...uniqueFiles]
    })
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
        addUniqueFiles(newFiles)
      }
    } catch (error) {
      console.error('Error selecting files:', error)
    }
  }

  const removeFile = (index: number) => {
    setMp3Files(prev => prev.filter((_, i) => i !== index))
  }

  const handleConvert = async () => {
    if (mp3Files.length === 0) {
      alert('Please select at least one MP3 file')
      return
    }

    try {
      const outputPath = await save({
        filters: [{
          name: 'M4B Audiobook',
          extensions: ['m4b']
        }]
      })

      if (!outputPath) return

      setIsConverting(true)
      
      const filePaths = mp3Files.map(f => f.path)
      
      // Validate inputs
      const validationError = validateConversionInputs(filePaths, outputPath)
      if (validationError) {
        alert(`Validation Error: ${validationError}`)
        return
      }

      // Generate FFmpeg arguments with chapter metadata
      const { args, metadataFile } = await generateFFmpegArgs(
        filePaths, 
        outputPath, 
        title || undefined, 
        author || undefined
      )

      const result = await invoke('convert_with_ffmpeg_args', {
        ffmpegArgs: args,
        metadataFile
      })

      alert(`Success: ${result}`)
    } catch (error) {
      alert(`Error: ${error}`)
    } finally {
      setIsConverting(false)
    }
  }

  const handleDragOver = (e: any) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: any) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: any) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer?.files || []) as File[]
    const mp3Files = files.filter(file => file.name.toLowerCase().endsWith('.mp3'))
    
    const newFiles: MP3File[] = mp3Files.map(file => ({
      name: file.name,
      path: file.name,
      size: file.size
    }))
    
    addUniqueFiles(newFiles)
  }

  return (
    <div class="app">
      <h1>Audiobook Creator</h1>
      
      <div 
        class={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
          <p class="hint">Select multiple MP3 files to create your audiobook</p>
        </div>
      </div>

      {mp3Files.length > 0 && (
        <div class="file-list">
          <h3>Selected Files ({mp3Files.length})</h3>
          <div class="files">
            {mp3Files.map((file, index) => (
              <div key={index} class="file-item">
                <div class="file-info">
                  <span class="file-name">{file.name}</span>
                  {file.size > 0 && (
                    <span class="file-size">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                </div>
                <button 
                  class="remove-btn"
                  onClick={() => removeFile(index)}
                  aria-label="Remove file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div class="metadata-form">
            <h3>Audiobook Details</h3>
            <div class="form-row">
              <label htmlFor="title">Title:</label>
              <input
                id="title"
                type="text"
                value={title}
                onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                placeholder="Enter book title (optional)"
              />
            </div>
            <div class="form-row">
              <label htmlFor="author">Author:</label>
              <input
                id="author"
                type="text"
                value={author}
                onInput={(e) => setAuthor((e.target as HTMLInputElement).value)}
                placeholder="Enter author name (optional)"
              />
            </div>
          </div>

          <button 
            class="convert-btn"
            onClick={handleConvert}
            disabled={isConverting}
          >
            {isConverting ? 'Converting...' : 'Create Audiobook'}
          </button>
        </div>
      )}
    </div>
  )
}
