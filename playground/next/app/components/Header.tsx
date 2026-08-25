'use client'

export interface HeaderProps {
  title: string
  userName: string
}

export function Header({ title, userName }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-title">
        <div className="header-title-icon" />
        {title}
      </div>
      <div className="header-user">
        <span>{userName}</span>
        <div className="header-avatar" />
      </div>
    </header>
  )
}
