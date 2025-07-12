import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="w-full max-w-4xl mx-auto">
      {children}
    </div>
  )
}

export default Layout