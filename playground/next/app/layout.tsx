import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { DevtoolsClientBootstrap } from './components/DevtoolsClientBootstrap'

export const metadata: Metadata = {
  title: 'TaskFlow Next',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body id="app">
        <DevtoolsClientBootstrap />
        {children}
      </body>
    </html>
  )
}
