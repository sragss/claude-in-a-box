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
    <div className="page-container">
      <Card className="page-card">
        <div className="page-header">
          <h1>Select Repository</h1>
          <p className="page-subtitle">Choose a GitHub repository to clone into your development environment</p>
          <div className="step-indicator">Step 2 of 3</div>
        </div>
        
        <div className="page-content">
          <div className="input-section">
            <label htmlFor="github-repo">GitHub Repository (Optional)</label>
            <Input
              id="github-repo"
              type="text"
              placeholder="user/repo or https://github.com/user/repo"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
            />
            <div className="input-help">
              <p>Examples:</p>
              <ul>
                <li><code>facebook/react</code></li>
                <li><code>https://github.com/vercel/next.js</code></li>
                <li>Leave empty for a blank environment</li>
              </ul>
            </div>
          </div>

          {status && <StatusMessage message={status.message} type={status.type} />}

          <div className="page-actions">
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