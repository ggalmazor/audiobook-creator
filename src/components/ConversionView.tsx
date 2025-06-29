import { useRef, useEffect } from 'preact/hooks'
import type { MP3File } from '../types/index.ts'

interface ConversionViewProps {
  mp3Files: MP3File[]
  title: string
  conversionProgress: string
  realtimeOutput: string[]
  showCommandOutput: boolean
  onToggleCommandOutput: () => void
}

export function ConversionView({
  mp3Files,
  title,
  conversionProgress,
  realtimeOutput,
  showCommandOutput,
  onToggleCommandOutput
}: ConversionViewProps) {
  const outputRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [realtimeOutput])

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
              onClick={onToggleCommandOutput}
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