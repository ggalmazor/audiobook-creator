import './app.css'
import { useState, useEffect } from 'preact/hooks'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { MP3File } from './types/index.ts'
import { validateConversionInputs } from './utils/conversionUtils.ts'
import { useRouter } from './hooks/useRouter.ts'
import { MainView } from './components/MainView.tsx'
import { ConversionView } from './components/ConversionView.tsx'

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
  const router = useRouter()
  
  // State management
  const [mp3Files, setMp3Files] = useState<MP3File[]>([])
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

  // Listen for real-time conversion output
  useEffect(() => {
    const unlisten = listen('conversion-output', (event) => {
      const output = event.payload as string
      setRealtimeOutput(prev => [...prev, output])
    })

    return () => {
      unlisten.then(f => f())
    }
  }, [])

  // Navigation effect for conversion state
  useEffect(() => {
    if (isConverting && router.isMainView) {
      router.navigate('conversion')
    } else if (!isConverting && router.isConversionView) {
      router.navigate('main')
    }
  }, [isConverting, router])

  // Event handlers
  const handleCoverChange = (cover: string | null, path: string | null, isAutoDetected: boolean) => {
    setCoverImage(cover)
    setCoverImagePath(path)
    setIsAutoDetectedCover(isAutoDetected)
  }

  const handleToggleCommandOutput = () => {
    setShowCommandOutput(!showCommandOutput)
  }

  const resetUIState = () => {
    setConversionProgress('')
    setCommandOutput('')
    setRealtimeOutput([])
    setShowCommandOutput(false)
    setMp3Files([])
    setCoverImage(null)
    setCoverImagePath(null)
    setIsAutoDetectedCover(false)
    setTitle('')
    setAuthor('')
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
      setShowCommandOutput(true)
      
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
        
        // Reset UI after showing success
        setTimeout(() => {
          resetUIState()
        }, 3000)
      } catch (error) {
        setConversionProgress('Conversion failed!')
        setCommandOutput(`❌ Error: ${error}`)
        
        // Reset UI after showing error
        setTimeout(() => {
          resetUIState()
        }, 5000)
      }
    } catch (error) {
      setConversionProgress('Conversion failed!')
      setCommandOutput(`❌ Error: ${error}`)
      
      // Reset UI after showing error
      setTimeout(() => {
        resetUIState()
      }, 5000)
    } finally {
      setIsConverting(false)
    }
  }

  // Router-based rendering
  if (router.isConversionView) {
    return (
      <ConversionView
        mp3Files={mp3Files}
        title={title}
        conversionProgress={conversionProgress}
        realtimeOutput={realtimeOutput}
        showCommandOutput={showCommandOutput}
        onToggleCommandOutput={handleToggleCommandOutput}
      />
    )
  }

  return (
    <MainView
      mp3Files={mp3Files}
      setMp3Files={setMp3Files}
      title={title}
      author={author}
      coverImage={coverImage}
      coverImagePath={coverImagePath}
      isAutoDetectedCover={isAutoDetectedCover}
      isConverting={isConverting}
      conversionProgress={conversionProgress}
      commandOutput={commandOutput}
      showCommandOutput={showCommandOutput}
      onTitleChange={setTitle}
      onAuthorChange={setAuthor}
      onCoverChange={handleCoverChange}
      onToggleCommandOutput={handleToggleCommandOutput}
      onConvert={handleConvert}
    />
  )
}
