import { useSession } from '../../contexts/AuthProvider'
import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { io, Socket } from 'socket.io-client'
import 'xterm/css/xterm.css'

const ExternalLinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15,3 21,3 21,9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
)

const TerminalView = () => {
  const { currentSession } = useSession()
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const socket = useRef<Socket | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!currentSession || !terminalRef.current) return

    console.log('🖥️ TERMINAL INIT:', currentSession.sessionId)
    
    // Create terminal instance
    terminal.current = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#000000',
        foreground: '#ffffff'
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14
    })

    // Create fit addon for responsive sizing
    fitAddon.current = new FitAddon()
    terminal.current.loadAddon(fitAddon.current)

    // Open terminal in DOM
    terminal.current.open(terminalRef.current)
    fitAddon.current.fit()

    // Socket.IO connection to wetty
    const socketPath = `/proxy/terminal/${currentSession.sessionId}/socket.io`
    console.log('🔌 SOCKET.IO CONNECTING:', socketPath)
    
    socket.current = io('/', {
      path: socketPath,
      transports: ['polling', 'websocket'],
      upgrade: true,
      withCredentials: true,
      forceNew: true,
      timeout: 15000,
      autoConnect: true
    })

    // Handle Socket.IO connection events
    socket.current.on('connect', () => {
      console.log('✅ SOCKET.IO CONNECTED')
      
      // Bridge Socket.IO and xterm.js
      socket.current!.on('data', (data: string) => {
        terminal.current!.write(data)
      })
      
      terminal.current!.onData((data: string) => {
        socket.current!.emit('input', data)
      })
      
      terminal.current!.focus()
    })

    socket.current.on('connect_error', (error) => {
      console.error('❌ SOCKET.IO ERROR:', error.message)
    })
    
    socket.current.on('disconnect', (reason) => {
      console.log('❌ SOCKET.IO DISCONNECTED:', reason)
    })

    // Handle window resize
    const handleResize = () => {
      if (fitAddon.current) {
        fitAddon.current.fit()
      }
    }
    window.addEventListener('resize', handleResize)

    // Cleanup function
    return () => {
      console.log('🧹 TERMINAL CLEANUP')
      window.removeEventListener('resize', handleResize)
      
      if (socket.current) {
        socket.current.disconnect()
        socket.current = null
      }
      
      if (terminal.current) {
        terminal.current.dispose()
        terminal.current = null
      }
      
      fitAddon.current = null
    }
  }, [currentSession?.sessionId])

  if (!currentSession) {
    console.log('No current session, hiding terminal')
    return null
  }

  const terminalUrl = currentSession.terminalUrl || `/proxy/terminal/${currentSession.sessionId}/wetty`

  return (
    <div className="overflow-hidden">
      <div className="flex justify-between items-center px-8 py-4 bg-muted border-t border-border">
        <h3 className="text-base font-medium text-foreground">Terminal Access</h3>
        <span className="font-mono text-xs text-muted-foreground bg-background px-2 py-1 rounded border border-border">
          Session: {currentSession.sessionId.substring(0, 8)}...
        </span>
      </div>
      <div className="h-[600px] bg-black sm:h-[400px] p-2">
        <div 
          ref={terminalRef}
          className="w-full h-full"
          style={{ minHeight: '100%' }}
        />
      </div>
      <div className="bg-muted px-8 py-4 flex justify-center items-center gap-4 border-t border-border">
        <a
          href={terminalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-muted-foreground no-underline text-sm px-4 py-2 rounded-lg border border-border bg-background transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
        >
          <ExternalLinkIcon />
          Open in new window
        </a>
        <button
          onClick={async () => {
            console.log('🧪 Testing proxy functionality...')
            try {
              const testUrl = `/test/proxy/${currentSession.sessionId}`
              console.log('🧪 Fetching:', testUrl)
              
              const response = await fetch(testUrl, {
                credentials: 'include'
              })
              
              // Enhanced response logging before parsing
              console.log('🧪 Response details:')
              console.log('  - Status:', response.status, response.statusText)
              console.log('  - URL:', response.url)
              console.log('  - Redirected:', response.redirected)
              console.log('  - Headers:')
              for (const [key, value] of response.headers.entries()) {
                console.log(`    ${key}: ${value}`)
              }
              
              // Get raw response text first
              const responseText = await response.text()
              console.log('🧪 Raw response text (first 500 chars):')
              console.log(responseText.substring(0, 500))
              
              // Check if response looks like JSON
              const contentType = response.headers.get('content-type') || ''
              const isJsonContent = contentType.includes('application/json')
              const looksLikeJson = responseText.trim().startsWith('{') || responseText.trim().startsWith('[')
              
              console.log('🧪 Content analysis:')
              console.log('  - Content-Type:', contentType)
              console.log('  - Looks like JSON:', looksLikeJson)
              console.log('  - Status OK:', response.ok)
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}\nResponse: ${responseText.substring(0, 200)}`)
              }
              
              if (!looksLikeJson) {
                throw new Error(`Response is not JSON (Content-Type: ${contentType})\nResponse: ${responseText.substring(0, 200)}`)
              }
              
              // Try parsing JSON
              let testResults
              try {
                testResults = JSON.parse(responseText)
                console.log('🧪 Parsed JSON successfully:', testResults)
              } catch (parseError) {
                throw new Error(`JSON parsing failed: ${parseError.message}\nResponse: ${responseText.substring(0, 200)}`)
              }
              
              const status = testResults.overall || 'ERROR'
              const message = testResults.recommendation || 'Check console for details'
              alert(`Proxy Test: ${status}\n\n${message}`)
              
            } catch (error) {
              console.error('🧪 Proxy test failed:', error)
              alert(`Proxy test failed: ${error.message}\n\nCheck console for full details`)
            }
          }}
          className="inline-flex items-center gap-2 text-muted-foreground text-sm px-4 py-2 rounded-lg border border-border bg-background transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
        >
          🧪 Test Proxy
        </button>
      </div>
    </div>
  )
}

export default TerminalView