import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'github' | 'logout'
  children: ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border-0 text-sm font-medium cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed no-underline',
          variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
          variant === 'secondary' && 'border border-border bg-background text-foreground hover:bg-accent',
          variant === 'github' && 'bg-[#24292e] text-white border border-border hover:bg-[#1a1e23] dark:bg-[#f6f8fa] dark:text-[#24292e] dark:hover:bg-[#e1e4e8]',
          variant === 'logout' && 'h-8 px-3 rounded-md border border-border bg-background text-foreground text-xs hover:bg-accent',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button