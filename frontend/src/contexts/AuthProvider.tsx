import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { authClient } from '../auth-client'
import type { PostSpinupCommand, SessionResponse } from '../types'

const MIDDLEWARE_URL = 'http://localhost:8080'

interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string
  createdAt: string
  updatedAt: string
}

interface AuthSession {
  data: {
    user: User
    session: {
      id: string
      userId: string
      expiresAt: string
      token: string
      createdAt: string
      updatedAt: string
      ipAddress: string
      userAgent: string
    }
  } | null
  error: any
}

interface DevSession {
  currentSession: SessionResponse | null
  isCreating: boolean
  isDestroying: boolean
}

interface AuthContextType {
  // Auth state
  user: User | null
  authSession: AuthSession | null
  isAuthLoading: boolean
  
  // Session state
  currentSession: SessionResponse | null
  isCreating: boolean
  isDestroying: boolean
  
  // Auth methods
  signIn: (provider: string) => Promise<any>
  signOut: () => Promise<void>
  
  // Session methods
  createSession: (postSpinupCommands?: PostSpinupCommand[]) => Promise<SessionResponse>
  destroySession: () => Promise<any>
  checkExistingSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  
  const [devSession, setDevSession] = useState<DevSession>({
    currentSession: null,
    isCreating: false,
    isDestroying: false
  })

  // Auth methods
  const checkAuthSession = useCallback(async () => {
    try {
      setIsAuthLoading(true)
      const sessionData = await authClient.getSession()
      console.log('Auth session check:', sessionData)
      setAuthSession(sessionData)
    } catch (error) {
      console.error('Auth session check error:', error)
      setAuthSession({ data: null, error })
    } finally {
      setIsAuthLoading(false)
    }
  }, [])

  const signIn = useCallback(async (provider: string) => {
    try {
      const data = await authClient.signIn.social({ provider })
      
      // Handle redirect response from Better Auth
      if (data?.data?.redirect && data?.data?.url) {
        console.log('Redirecting to OAuth URL:', data.data.url)
        window.location.href = data.data.url
      }
      
      return data
    } catch (error) {
      console.error('Sign in error:', error)
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      // First destroy any active dev sessions
      if (devSession.currentSession) {
        await destroySession()
      }
      
      // Then sign out from auth
      await authClient.signOut()
      
      // Clear auth state
      setAuthSession({ data: null, error: null })
      
      // Clear any stored session data
      localStorage.removeItem('currentSessionId')
      
      console.log('Successfully signed out')
    } catch (error) {
      console.error('Sign out error:', error)
      // Even if there's an error, clear local state
      setAuthSession({ data: null, error: null })
      setDevSession({
        currentSession: null,
        isCreating: false,
        isDestroying: false
      })
      localStorage.removeItem('currentSessionId')
    }
  }, [devSession.currentSession])

  // Session methods
  const checkExistingSession = useCallback(async () => {
    const storedSessionId = localStorage.getItem('currentSessionId')
    if (storedSessionId && authSession?.data?.user) {
      try {
        const response = await fetch(`${MIDDLEWARE_URL}/api/session/${storedSessionId}/status`, {
          credentials: 'include'
        })
        
        if (response.ok) {
          const sessionData = await response.json()
          setDevSession(prev => ({
            ...prev,
            currentSession: {
              sessionId: storedSessionId,
              wettyPort: sessionData.ports.wetty,
              devPort: sessionData.ports.dev,
              success: true,
              message: 'Session restored'
            }
          }))
        } else {
          localStorage.removeItem('currentSessionId')
        }
      } catch (error) {
        console.error('Error checking existing session:', error)
        localStorage.removeItem('currentSessionId')
      }
    }
  }, [authSession?.data?.user])

  const createSession = useCallback(async (postSpinupCommands: PostSpinupCommand[] = []) => {
    if (!authSession?.data?.user) {
      throw new Error('Must be authenticated to create session')
    }

    setDevSession(prev => ({ ...prev, isCreating: true }))
    
    try {
      const response = await fetch(`${MIDDLEWARE_URL}/api/session/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ postSpinupCommands })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        localStorage.setItem('currentSessionId', result.sessionId)
        
        setDevSession(prev => ({
          ...prev,
          currentSession: result,
          isCreating: false
        }))
        return result
      } else {
        throw new Error(result.error || 'Failed to create session')
      }
    } catch (error) {
      setDevSession(prev => ({ ...prev, isCreating: false }))
      throw error
    }
  }, [authSession?.data?.user])

  const destroySession = useCallback(async () => {
    if (!devSession.currentSession) {
      throw new Error('No active session to destroy')
    }

    setDevSession(prev => ({ ...prev, isDestroying: true }))

    try {
      const response = await fetch(`${MIDDLEWARE_URL}/api/session/${devSession.currentSession.sessionId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      const result = await response.json()

      if (response.ok && result.success) {
        localStorage.removeItem('currentSessionId')
        
        setDevSession({
          currentSession: null,
          isCreating: false,
          isDestroying: false
        })
        return result
      } else {
        throw new Error(result.error || 'Failed to destroy session')
      }
    } catch (error) {
      setDevSession(prev => ({ ...prev, isDestroying: false }))
      throw error
    }
  }, [devSession.currentSession])

  // Initialize auth on mount
  useEffect(() => {
    checkAuthSession()
    
    // Listen for storage changes (useful for multi-tab scenarios)
    const handleStorageChange = () => {
      checkAuthSession()
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [checkAuthSession])

  // Check for existing dev session when auth state changes
  useEffect(() => {
    if (authSession?.data?.user && !devSession.currentSession) {
      checkExistingSession()
    }
  }, [authSession?.data?.user, checkExistingSession])

  const value: AuthContextType = {
    // Auth state
    user: authSession?.data?.user || null,
    authSession,
    isAuthLoading,
    
    // Dev session state
    currentSession: devSession.currentSession,
    isCreating: devSession.isCreating,
    isDestroying: devSession.isDestroying,
    
    // Methods
    signIn,
    signOut,
    createSession,
    destroySession,
    checkExistingSession
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Keep useSession for backward compatibility, but delegate to useAuth
export const useSession = () => {
  const { currentSession, isCreating, isDestroying, createSession, destroySession, checkExistingSession } = useAuth()
  return {
    currentSession,
    isCreating,
    isDestroying,
    createSession,
    destroySession,
    checkExistingSession
  }
}