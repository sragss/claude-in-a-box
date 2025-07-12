import { useAuth } from '../../contexts/AuthProvider'
import { useStatus } from '../../hooks/useStatus'
import type { PostSpinupCommand } from '../../types'
import Button from '../ui/Button'
import Card from '../ui/Card'
import StatusMessage from '../ui/StatusMessage'

interface SessionControlsProps {
  githubRepo: string
}

const SessionControls = ({ githubRepo }: SessionControlsProps) => {
  const { user, currentSession, isCreating, isDestroying, createSession, destroySession } = useAuth()
  const { status, showStatus, clearStatus } = useStatus()

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

  const handleCreateSession = async () => {
    if (!user) {
      showStatus('Not authenticated', 'error')
      return
    }

    try {
      clearStatus()
      
      const postSpinupCommands: PostSpinupCommand[] = []

      if (githubRepo.trim()) {
        const repoInfo = validateGithubRepo(githubRepo.trim())
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
    }
  }

  const handleDestroySession = async () => {
    try {
      clearStatus()
      await destroySession()
      showStatus('Environment cleaned up successfully', 'success')
    } catch (error) {
      console.error('Destroy session error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to cleanup environment'
      showStatus(errorMessage, 'error')
    }
  }

  if (!user) return null

  return (
    <Card className="p-8">
      <div className="text-center space-y-6">
        <h2 className="text-2xl font-semibold text-foreground">Development Environment</h2>
        <div className="flex justify-center">
          {!currentSession ? (
            <Button
              variant="primary"
              onClick={handleCreateSession}
              disabled={isCreating}
            >
              {isCreating ? 'Creating Environment...' : 'Create New Environment'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={handleDestroySession}
              disabled={isDestroying}
            >
              {isDestroying ? 'Cleaning up...' : 'Cleanup Environment'}
            </Button>
          )}
        </div>
        {status && <StatusMessage message={status.message} type={status.type} />}
      </div>
    </Card>
  )
}

export default SessionControls