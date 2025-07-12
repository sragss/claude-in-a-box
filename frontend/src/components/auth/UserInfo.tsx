import { useAuth } from '../../contexts/AuthProvider'
import Button from '../ui/Button'

const UserInfo = () => {
  const { user, signOut } = useAuth()

  if (!user) return null

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <div className="user-info">
      <span>Welcome, {user.name || user.email || 'User'}!</span>
      <Button variant="logout" onClick={handleSignOut}>
        Logout
      </Button>
    </div>
  )
}

export default UserInfo