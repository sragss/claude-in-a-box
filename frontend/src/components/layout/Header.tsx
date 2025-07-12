import { useAuth } from '../../contexts/AuthProvider'
import UserInfo from '../auth/UserInfo'

const Header = () => {
  const { user } = useAuth()

  return (
    <header className="app-header">
      <div className="header-brand">
        <h1 className="app-title">Claude in a Box</h1>
        <p className="app-subtitle">AI-powered development environment</p>
      </div>
      {user && <UserInfo />}
    </header>
  )
}

export default Header