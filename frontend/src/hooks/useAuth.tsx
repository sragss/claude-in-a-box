import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { authClient } from '../auth-client'

// Define user type based on what Better Auth returns
interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string
  createdAt: string
  updatedAt: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkSession = async () => {
    try {
      setIsLoading(true)
      const session = await authClient.getSession()
      console.log('Session check:', session)
      setUser(session?.user || null)
      
      // Handle OAuth callback - retry session check after a delay
      if (!session?.user && (window.location.search.includes('code=') || window.location.search.includes('state='))) {
        console.log('Detected OAuth callback, retrying session check...')
        setTimeout(async () => {
          try {
            const retrySession = await authClient.getSession()
            console.log('Retry session:', retrySession)
            setUser(retrySession?.user || null)
          } catch (error) {
            console.error('Retry session check failed:', error)
          }
        }, 1000)
      }
    } catch (error) {
      console.error('Session check failed:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const signIn = async () => {
    try {
      await authClient.signIn.social({ provider: 'github' })
    } catch (error) {
      console.error('Sign in failed:', error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      await authClient.signOut()
      setUser(null)
    } catch (error) {
      console.error('Sign out failed:', error)
      throw error
    }
  }

  useEffect(() => {
    checkSession()
  }, [])

  const value: AuthContextType = {
    user,
    isLoading,
    signIn,
    signOut
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}