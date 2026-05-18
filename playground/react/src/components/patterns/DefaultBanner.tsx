import React from 'react'

// PATTERN: default export — function declaration (`export default function X`)
export interface DefaultBannerProps {
  message: string
  tone?: 'info' | 'warn'
}

export default function DefaultBanner({
  message,
  tone = 'info',
}: DefaultBannerProps) {
  return (
    <div className="stat-card" data-tone={tone}>
      <strong>DefaultBanner</strong>: {message} ({tone})
    </div>
  )
}
