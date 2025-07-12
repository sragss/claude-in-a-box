import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthProvider'
import Layout from './components/layout/Layout'
import Header from './components/layout/Header'
import LoginPage from './pages/LoginPage'
import RepoSelectionPage from './pages/RepoSelectionPage'
import SessionLaunchPage from './pages/SessionLaunchPage'

const AppContent = () => {
  const { isAuthLoading } = useAuth()

  if (isAuthLoading) {
    return (
      <Layout>
        <Header />
        <div className="text-center py-8">
          Loading...
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Header />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/setup" element={<RepoSelectionPage />} />
        <Route path="/launch" element={<SessionLaunchPage />} />
      </Routes>
    </Layout>
  )
}

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App