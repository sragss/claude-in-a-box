import { useAuth } from '../contexts/AuthProvider'
import { useStatus } from '../hooks/useStatus'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import StatusMessage from '../components/ui/StatusMessage'

const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

const LoginPage = () => {
  const { signIn } = useAuth()
  const { status, showStatus } = useStatus()

  const handleSignIn = async () => {
    try {
      showStatus('Redirecting to GitHub...', 'info')
      await signIn('github')
    } catch (error) {
      console.error('GitHub login error:', error)
      showStatus('Failed to sign in with GitHub', 'error')
    }
  }

  return (
    <div className="page-container">
      <Card className="page-card">
        <div className="page-header">
          <h1>Welcome</h1>
          <p className="page-subtitle">Sign in with GitHub to create and manage your development environments</p>
          <div className="step-indicator">Step 1 of 3</div>
        </div>
        
        <div className="page-content">
          <div className="page-actions">
            <Button variant="github" onClick={handleSignIn}>
              <GitHubIcon />
              Sign in with GitHub
            </Button>
          </div>
          
          {status && <StatusMessage message={status.message} type={status.type} />}
        </div>
      </Card>
    </div>
  )
}

export default LoginPage