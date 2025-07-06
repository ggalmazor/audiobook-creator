import { useRef, useEffect, useState } from 'preact/hooks'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { debug, info, error } from '@tauri-apps/plugin-log'
import type { MP3File } from '../types/index.ts'
import { deduplicateFiles } from '../utils/fileUtils.ts'

interface FileListProps {
  mp3Files: MP3File[]
  setMp3Files: (files: MP3File[]) => void
  onMetadataExtracted: (title: string | null, author: string | null, cover: string | null) => void
  isConverting: boolean
  isDragOver: boolean
  setIsDragOver: (isDragOver: boolean) => void
  draggedIndex: number | null
  setDraggedIndex: (index: number | null) => void
}

export function FileList({
  mp3Files,
  setMp3Files,
  onMetadataExtracted,
  isConverting,
  isDragOver,
  setIsDragOver,
  draggedIndex,
  setDraggedIndex
}: FileListProps) {
  const dragCounter = useRef(0)
  const [debugLogs, setDebugLogs] = useState<string[]>([])
  
  // Helper function to log errors and important events
  const debugLog = async (message: string) => {
    console.log(message)
    await info(message)
    setDebugLogs(prev => [...prev.slice(-5), `${new Date().toLocaleTimeString()}: ${message}`]) // Keep last 5 logs
  }

  // Listen for Tauri drag drop events using the proper v2 API
  useEffect(() => {
    (async () => {
      try {
        const webview = getCurrentWebview()
        const unlisten = await webview.onDragDropEvent(async (event) => {
          if (event.payload.type === 'over') {
            setIsDragOver(true)
          } else if (event.payload.type === 'drop') {
            setIsDragOver(false)
            
            const paths = event.payload.paths || []
            const mp3Paths = paths.filter((path: string) => path.toLowerCase().endsWith('.mp3'))
            
            if (mp3Paths.length > 0) {
              await debugLog(`📁 Dropped ${mp3Paths.length} MP3 file(s)`)
              
              const newFiles: MP3File[] = mp3Paths.map((path: string) => {
                const fileName = path.split('/').pop() || path.split('\\').pop() || path
                return {
                  name: fileName,
                  path,
                  size: 0
                }
              })
              
              await addUniqueFiles(newFiles)
            } else {
              await debugLog('📁 No MP3 files found in drop')
            }
          } else if (event.payload.type === 'cancel') {
            setIsDragOver(false)
          }
        })
        
        return () => {
          unlisten()
        }
      } catch (error) {
        await debugLog('❌ Failed to set up drag drop: ' + String(error))
      }
    })()
  }, [mp3Files.length, onMetadataExtracted])


  const addUniqueFiles = async (newFiles: MP3File[]) => {
    const uniqueFiles = deduplicateFiles(mp3Files, newFiles)
    setMp3Files([...mp3Files, ...uniqueFiles])
    
    // Extract metadata and cover from the first file if we're adding the first files
    if (mp3Files.length === 0 && newFiles.length > 0) {
      try {
        // Extract metadata (title and author)
        const metadata = await invoke('extract_mp3_metadata_command', { mp3File: newFiles[0].path })
        
        if (metadata && Array.isArray(metadata)) {
          const [extractedTitle, extractedAuthor] = metadata
          
          // Extract cover
          let extractedCover = null
          try {
            const cover = await invoke('extract_mp3_cover', { mp3File: newFiles[0].path })
            if (cover && typeof cover === 'string') {
              extractedCover = cover
            }
          } catch (error) {
            await debugLog('No cover art found in first MP3 file')
          }
          
          onMetadataExtracted(extractedTitle || null, extractedAuthor || null, extractedCover)
        }
      } catch (error) {
        await debugLog('Could not extract metadata from first MP3 file')
      }
    }
  }

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'MP3 Audio',
          extensions: ['mp3']
        }]
      })
      
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

  const removeFile = (index: number) => {
    setMp3Files(mp3Files.filter((_, i) => i !== index))
  }

  const moveFile = (fromIndex: number, toIndex: number) => {
    const newFiles = [...mp3Files]
    const [moved] = newFiles.splice(fromIndex, 1)
    newFiles.splice(toIndex, 0, moved)
    setMp3Files(newFiles)
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

  // Browser drag handlers (fallback for web mode)
  const handleDropZoneDragEnter = (e: any) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    setIsDragOver(true)
  }

  const handleDropZoneDragOver = (e: any) => {
    e.preventDefault()
    e.stopPropagation()
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
    
    if (mp3Files.length > 0) {
      await debugLog(`🔄 Browser dropped ${mp3Files.length} MP3 file(s)`)
      
      const newFiles: MP3File[] = mp3Files.map(file => ({
        name: file.name,
        path: (file as any).path || file.name,
        size: file.size
      }))
      
      await addUniqueFiles(newFiles)
    }
  }

  if (mp3Files.length === 0) {
    return (
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
        
        {/* Debug logs display */}
        {debugLogs.length > 0 && (
          <div style={{
            marginTop: '20px',
            padding: '10px',
            backgroundColor: '#f0f0f0',
            borderRadius: '5px',
            fontSize: '12px',
            fontFamily: 'monospace',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            <strong>Debug Logs:</strong>
            {debugLogs.map((log, index) => (
              <div key={index} style={{margin: '2px 0'}}>{log}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
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
  )
}