import { useState, useCallback } from 'react'
import type { StatusType, StatusMessage } from '../types'

export const useStatus = () => {
  const [status, setStatus] = useState<StatusMessage | null>(null)

  const showStatus = useCallback((message: string, type: StatusType) => {
    setStatus({ message, type })
  }, [])

  const clearStatus = useCallback(() => {
    setStatus(null)
  }, [])

  return {
    status,
    showStatus,
    clearStatus
  }
}