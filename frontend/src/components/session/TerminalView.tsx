import { useSession } from '../../contexts/AuthProvider'

const ExternalLinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15,3 21,3 21,9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
)

const TerminalView = () => {
  const { currentSession } = useSession()

  console.log('TerminalView currentSession:', currentSession)

  if (!currentSession) {
    console.log('No current session, hiding terminal')
    return null
  }

  const terminalUrl = `http://localhost:${currentSession.wettyPort}/wetty`

  return (
    <div className="terminal-section">
      <div className="terminal-header">
        <h3>Terminal Access</h3>
        <span className="session-info">
          Session: {currentSession.sessionId.substring(0, 8)}... | Port: {currentSession.wettyPort}
        </span>
      </div>
      <div className="terminal-wrapper">
        <iframe
          src={terminalUrl}
          className="terminal-iframe"
          title="Terminal"
        />
      </div>
      <div className="terminal-footer">
        <a
          href={terminalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="external-link"
        >
          <ExternalLinkIcon />
          Open in new window
        </a>
      </div>
    </div>
  )
}

export default TerminalView