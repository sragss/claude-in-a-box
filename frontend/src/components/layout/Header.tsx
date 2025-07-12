import UserInfo from '../auth/UserInfo'

const Header = () => {
  return (
    <header className="app-header">
      <h1 className="app-title">Claude in a Box</h1>
      <p className="app-subtitle">AI-powered development environment</p>
      <UserInfo />
    </header>
  )
}

export default Header