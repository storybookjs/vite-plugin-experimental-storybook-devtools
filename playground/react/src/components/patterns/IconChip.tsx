import React from 'react'

// PATTERN: default export via identifier (`const X = ...; export default X`)
// PROP: element prop that is NOT `children` (`icon: ReactNode`)
export interface IconChipProps {
  icon: React.ReactNode
  label: string
}

const IconChip = ({ icon, label }: IconChipProps) => {
  return (
    <span className="task-card-priority">
      <span className="task-card-priority-dot medium" />
      {icon}
      <span>{label}</span>
    </span>
  )
}

export default IconChip
