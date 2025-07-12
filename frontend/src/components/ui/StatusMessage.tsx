import type { StatusType } from '../../types'

interface StatusMessageProps {
  message: string
  type: StatusType
  className?: string
}

const StatusMessage = ({ message, type, className = '' }: StatusMessageProps) => {
  const classes = ['status-message', `status-${type}`, className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {message}
    </div>
  )
}

export default StatusMessage