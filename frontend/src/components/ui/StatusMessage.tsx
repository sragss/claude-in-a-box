import type { StatusType } from '../../types'
import { cn } from '../../lib/utils'

interface StatusMessageProps {
  message: string
  type: StatusType
  className?: string
}

const StatusMessage = ({ message, type, className }: StatusMessageProps) => {
  return (
    <div 
      className={cn(
        'text-center px-4 py-3 rounded-lg mt-4 text-sm font-medium',
        type === 'success' && 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200',
        type === 'error' && 'bg-destructive/10 border border-destructive/30 text-destructive',
        type === 'info' && 'bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200',
        className
      )}
    >
      {message}
    </div>
  )
}

export default StatusMessage