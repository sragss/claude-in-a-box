import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

const Card = ({ children, className, ...props }: CardProps) => {
  return (
    <div 
      className={cn('bg-card border border-border rounded-lg shadow-sm p-4', className)} 
      {...props}
    >
      {children}
    </div>
  )
}

export default Card