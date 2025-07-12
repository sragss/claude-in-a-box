import { useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/layout/Layout'
import Header from './components/layout/Header'
import LoginForm from './components/auth/LoginForm'
import SessionControls from './components/session/SessionControls'
import TerminalView from './components/session/TerminalView'

const AppContent = () => {
  const { user, isLoading } = useAuth()
  const [githubRepo, setGithubRepo] = useState('')

  if (isLoading) {
    return (
      <Layout>
        <Header />
        <div className="loading-container">
          Loading...
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Header />
      
      {!user ? (
        <LoginForm 
          githubRepo={githubRepo}
          onGithubRepoChange={setGithubRepo}
        />
      ) : (
        <>
          <SessionControls githubRepo={githubRepo} />
          <TerminalView />
        </>
      )}
    </Layout>
  )
}

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App