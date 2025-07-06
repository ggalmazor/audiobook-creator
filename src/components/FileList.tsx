import { useRef, useEffect } from 'preact/hooks'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
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

  // Component mount logging
  useEffect(() => {
    console.log('🚀 FileList component mounted')
    console.log('🚀 Window object keys:', Object.keys(window))
    console.log('🚀 Tauri available:', typeof window !== 'undefined' && '__TAURI__' in window)
    console.log('🚀 Listen function:', typeof listen)
    console.log('🚀 Invoke function:', typeof invoke)
    
    return () => {
      console.log('🚀 FileList component unmounting')
    }
  }, [])

  // Listen for ALL Tauri events to debug
  useEffect(() => {
    console.log('🔍 Setting up debug event listeners...')
    
    const debugUnlisten = listen('tauri://file-drop-hover', (event) => {
      console.log('🔍 Tauri file-drop-hover event:', event)
    })
    
    const debugUnlisten2 = listen('tauri://file-drop-cancelled', (event) => {
      console.log('🔍 Tauri file-drop-cancelled event:', event)
    })

    return () => {
      debugUnlisten.then(f => f())
      debugUnlisten2.then(f => f())
    }
  }, [])

  // Listen for Tauri file drop events
  useEffect(() => {
    console.log('🔧 Setting up Tauri file drop listener...')
    
    const handleFileDrop = async (event: any) => {
      console.log('📁 Tauri file drop event received:', event)
      console.log('📁 Event payload:', event.payload)
      console.log('📁 Event type:', typeof event.payload)
      
      const files = event.payload as string[]
      console.log('📁 Files from payload:', files)
      
      const mp3Paths = files.filter(path => {
        const isMP3 = path.toLowerCase().endsWith('.mp3')
        console.log(`📁 File "${path}" is MP3: ${isMP3}`)
        return isMP3
      })
      
      console.log('📁 Filtered MP3 paths:', mp3Paths)
      
      if (mp3Paths.length > 0) {
        const newFiles: MP3File[] = mp3Paths.map(path => {
          const fileName = path.split('/').pop() || path.split('\\').pop() || path
          console.log(`📁 Creating file object: name="${fileName}", path="${path}"`)
          return {
            name: fileName,
            path,
            size: 0
          }
        })
        
        console.log('📁 New files to add:', newFiles)
        await addUniqueFiles(newFiles)
      } else {
        console.log('📁 No MP3 files found in drop')
      }
    }

    const unlisten = listen('tauri://file-drop', handleFileDrop)
    console.log('🔧 Tauri file drop listener set up successfully')

    return () => {
      console.log('🔧 Cleaning up Tauri file drop listener')
      unlisten.then(f => f())
    }
  }, [mp3Files.length, onMetadataExtracted])

  const addUniqueFiles = async (newFiles: MP3File[]) => {
    console.log('➕ addUniqueFiles called with:', newFiles)
    console.log('➕ Current mp3Files length:', mp3Files.length)
    
    const uniqueFiles = deduplicateFiles(mp3Files, newFiles)
    console.log('➕ Unique files after deduplication:', uniqueFiles)
    
    setMp3Files([...mp3Files, ...uniqueFiles])
    console.log('➕ Updated mp3Files state')
    
    // Extract metadata and cover from the first file if we're adding the first files
    if (mp3Files.length === 0 && newFiles.length > 0) {
      console.log('➕ Extracting metadata from first file:', newFiles[0].path)
      try {
        // Extract metadata (title and author)
        const metadata = await invoke('extract_mp3_metadata_command', { mp3File: newFiles[0].path })
        console.log('➕ Metadata extracted:', metadata)
        
        if (metadata && Array.isArray(metadata)) {
          const [extractedTitle, extractedAuthor] = metadata
          console.log('➕ Title:', extractedTitle, 'Author:', extractedAuthor)
          
          // Extract cover
          let extractedCover = null
          try {
            const cover = await invoke('extract_mp3_cover', { mp3File: newFiles[0].path })
            console.log('➕ Cover extracted:', cover ? 'Yes' : 'No')
            if (cover && typeof cover === 'string') {
              extractedCover = cover
            }
          } catch (error) {
            console.log('➕ No cover art found in first MP3 file:', error)
          }
          
          console.log('➕ Calling onMetadataExtracted with:', extractedTitle, extractedAuthor, extractedCover ? 'cover present' : 'no cover')
          onMetadataExtracted(extractedTitle || null, extractedAuthor || null, extractedCover)
        }
      } catch (error) {
        console.log('➕ No metadata found in first MP3 file:', error)
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

  const handleDropZoneDragEnter = (e: any) => {
    console.log('🔄 Browser drag enter event:', e)
    e.preventDefault()
    dragCounter.current++
    setIsDragOver(true)
  }

  const handleDropZoneDragOver = (e: any) => {
    console.log('🔄 Browser drag over event:', e)
    e.preventDefault()
  }

  const handleDropZoneDragLeave = (e: any) => {
    console.log('🔄 Browser drag leave event:', e)
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDropZoneDrop = async (e: any) => {
    console.log('🔄 Browser drop event:', e)
    console.log('🔄 DataTransfer object:', e.dataTransfer)
    console.log('🔄 Files from dataTransfer:', e.dataTransfer?.files)
    
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer?.files || []) as File[]
    console.log('🔄 Files array:', files)
    
    const mp3Files = files.filter(file => {
      const isMP3 = file.name.toLowerCase().endsWith('.mp3')
      console.log(`🔄 Browser file "${file.name}" is MP3: ${isMP3}`)
      return isMP3
    })
    
    console.log('🔄 Filtered MP3 files from browser:', mp3Files)
    
    const newFiles: MP3File[] = mp3Files.map(file => {
      const filePath = (file as any).path || file.name
      console.log(`🔄 Browser file object: name="${file.name}", path="${filePath}", size=${file.size}`)
      return {
        name: file.name,
        path: filePath,
        size: file.size
      }
    })
    
    console.log('🔄 New files from browser drop:', newFiles)
    await addUniqueFiles(newFiles)
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