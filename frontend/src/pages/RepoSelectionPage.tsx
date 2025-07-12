import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthProvider'
import { useStatus } from '../hooks/useStatus'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import StatusMessage from '../components/ui/StatusMessage'

const RepoSelectionPage = () => {
  const navigate = useNavigate()
  const { setSelectedRepo } = useAuth()
  const { status, showStatus, clearStatus } = useStatus()
  const [githubRepo, setGithubRepo] = useState('')

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

  const handleContinue = () => {
    try {
      clearStatus()
      
      if (githubRepo.trim()) {
        const repoInfo = validateGithubRepo(githubRepo.trim())
        if (repoInfo) {
          console.log('Selected repo:', repoInfo)
          setSelectedRepo(githubRepo.trim())
          navigate('/launch')
        }
      } else {
        // Continue with empty repo (blank environment)
        setSelectedRepo('')
        navigate('/launch')
      }
    } catch (error) {
      console.error('Repo validation error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Invalid repository format'
      showStatus(errorMessage, 'error')
    }
  }

  const handleSkip = () => {
    setSelectedRepo('')
    navigate('/launch')
  }

  return (
    <div className="flex justify-center mb-8">
      <Card className="w-full max-w-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-2 text-foreground">Select Repository</h1>
          <p className="text-muted-foreground text-sm mb-6">Choose a GitHub repository to clone into your development environment</p>
          <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded inline-block">Step 2 of 3</div>
        </div>
        
        <div className="space-y-6">
          <div className="space-y-3">
            <label htmlFor="github-repo" className="text-sm font-medium text-foreground">GitHub Repository (Optional)</label>
            <Input
              id="github-repo"
              type="text"
              placeholder="user/repo or https://github.com/user/repo"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
            />
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Examples:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><code className="bg-muted px-1 py-0.5 rounded text-xs">facebook/react</code></li>
                <li><code className="bg-muted px-1 py-0.5 rounded text-xs">https://github.com/vercel/next.js</code></li>
                <li>Leave empty for a blank environment</li>
              </ul>
            </div>
          </div>

          {status && <StatusMessage message={status.message} type={status.type} />}

          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={handleSkip}>
              Skip - Create Empty Environment
            </Button>
            <Button variant="primary" onClick={handleContinue}>
              Continue{githubRepo.trim() && ` with ${githubRepo.trim()}`}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default RepoSelectionPage