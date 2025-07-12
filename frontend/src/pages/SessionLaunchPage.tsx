import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthProvider'
import { useStatus } from '../hooks/useStatus'
import type { PostSpinupCommand } from '../types'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import StatusMessage from '../components/ui/StatusMessage'
import TerminalView from '../components/session/TerminalView'

const SessionLaunchPage = () => {
  const navigate = useNavigate()
  const { user, selectedRepo, currentSession, isCreating, createSession, destroySession } = useAuth()
  const { status, showStatus, clearStatus } = useStatus()
  const [hasLaunched, setHasLaunched] = useState(false)

  const validateGithubRepo = (repo: string) => {
    if (!repo) return null

    let repoUrl = repo
    let repoName = ''

    if (repo.startsWith('https://github.com/')) {
      repoUrl = repo
      repoName = repo.split('/').pop()?.replace('.git', '') || 'repo'
    } else if (repo.includes('/') && !repo.includes('://')) {
      repoUrl = `https://github.com/${repo}`
      repoName = repo.split('/').pop()?.replace('.git', '') || 'repo'
    } else {
      throw new Error('Invalid GitHub repo format. Use: user/repo or full URL')
    }

    return { repoUrl, repoName }
  }

  const launchSession = async () => {
    if (!user) {
      showStatus('Not authenticated', 'error')
      return
    }

    try {
      clearStatus()
      setHasLaunched(true)
      
      const postSpinupCommands: PostSpinupCommand[] = []

      if (selectedRepo.trim()) {
        const repoInfo = validateGithubRepo(selectedRepo.trim())
        if (repoInfo) {
          const { repoUrl, repoName } = repoInfo
          showStatus(`Creating development environment and cloning ${repoName}...`, 'info')
          postSpinupCommands.push({
            type: 'git_clone',
            repo: repoUrl,
            directory: `/home/node/${repoName}`
          })
        }
      } else {
        showStatus('Creating development environment...', 'info')
      }

      await createSession(postSpinupCommands)
      showStatus('Environment created successfully!', 'success')
    } catch (error) {
      console.error('Create session error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create environment'
      showStatus(errorMessage, 'error')
      setHasLaunched(false)
    }
  }

  const handleDestroySession = async () => {
    try {
      clearStatus()
      await destroySession()
      showStatus('Environment cleaned up successfully', 'success')
      setHasLaunched(false)
    } catch (error) {
      console.error('Destroy session error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to cleanup environment'
      showStatus(errorMessage, 'error')
    }
  }

  // Auto-launch session if not already launched and no existing session
  useEffect(() => {
    if (!hasLaunched && !currentSession && !isCreating) {
      launchSession()
    }
  }, [hasLaunched, currentSession, isCreating])

  const getRepoDisplayName = () => {
    if (!selectedRepo) return 'Empty Environment'
    try {
      const repoInfo = validateGithubRepo(selectedRepo)
      return repoInfo?.repoName || selectedRepo
    } catch {
      return selectedRepo
    }
  }

  return (
    <div className="page-container">
      <Card className="page-card">
        <div className="page-header">
          <h1>Development Environment</h1>
          <p className="page-subtitle">Repository: {getRepoDisplayName()}</p>
          <div className="step-indicator">Step 3 of 3</div>
        </div>

        <div className="page-content">
          {currentSession && (
            <div className="session-info">
              <p><strong>Session ID:</strong> {currentSession.sessionId.substring(0, 8)}...</p>
            </div>
          )}

          {status && <StatusMessage message={status.message} type={status.type} />}

          <div className="page-actions">
            {!currentSession ? (
              <>
                <Button
                  variant="primary"
                  onClick={launchSession}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating Environment...' : 'Retry Launch'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/setup')}
                  disabled={isCreating}
                >
                  Back to Repository Selection
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={handleDestroySession}>
                  Cleanup Environment
                </Button>
                <Button variant="secondary" onClick={() => navigate('/setup')}>
                  Create New Environment
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {currentSession && <TerminalView />}
    </div>
  )
}

export default SessionLaunchPage