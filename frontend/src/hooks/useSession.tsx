import { useState, useCallback } from 'react'
import type { PostSpinupCommand, SessionResponse } from '../types'

const MIDDLEWARE_URL = 'http://localhost:8080'

interface SessionState {
  currentSession: SessionResponse | null
  isCreating: boolean
  isDestroying: boolean
}

export const useSession = () => {
  const [sessionState, setSessionState] = useState<SessionState>({
    currentSession: null,
    isCreating: false,
    isDestroying: false
  })

  const createSession = useCallback(async (postSpinupCommands: PostSpinupCommand[] = []) => {
    setSessionState(prev => ({ ...prev, isCreating: true }))
    
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
        setSessionState(prev => ({
          ...prev,
          currentSession: result,
          isCreating: false
        }))
        return result
      } else {
        throw new Error(result.error || 'Failed to create session')
      }
    } catch (error) {
      setSessionState(prev => ({ ...prev, isCreating: false }))
      throw error
    }
  }, [])

  const destroySession = useCallback(async () => {
    if (!sessionState.currentSession) {
      throw new Error('No active session to destroy')
    }

    setSessionState(prev => ({ ...prev, isDestroying: true }))

    try {
      const response = await fetch(`${MIDDLEWARE_URL}/api/session/${sessionState.currentSession.sessionId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSessionState({
          currentSession: null,
          isCreating: false,
          isDestroying: false
        })
        return result
      } else {
        throw new Error(result.error || 'Failed to destroy session')
      }
    } catch (error) {
      setSessionState(prev => ({ ...prev, isDestroying: false }))
      throw error
    }
  }, [sessionState.currentSession])

  return {
    ...sessionState,
    createSession,
    destroySession
  }
}