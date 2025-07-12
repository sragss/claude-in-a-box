import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    const classes = ['input', className].filter(Boolean).join(' ')

    return (
      <input
        ref={ref}
        className={classes}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

export default Input