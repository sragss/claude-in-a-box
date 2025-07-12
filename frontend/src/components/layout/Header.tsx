import { useAuth } from '../../contexts/AuthProvider'
import UserInfo from '../auth/UserInfo'

const Header = () => {
  const { user } = useAuth()

  return (
    <header className="text-center mb-12">
      <div>
        <h1 className="text-4xl font-bold mb-2 tracking-tight text-foreground">Claude in a Box</h1>
        <p className="text-base text-muted-foreground">AI-powered development environment</p>
      </div>
      {user && <UserInfo />}
    </header>
  )
}

export default Header