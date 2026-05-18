import React from 'react'

// PATTERN: generic component (`function X<T>(props: Props<T>)`)
// PROP: render-prop / function-as-data (`renderItem: (item: T) => ReactNode`)
//       and an array-of-primitives / array-of-T prop.
export interface GenericListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  emptyLabel?: string
}

export function GenericList<T>({
  items,
  renderItem,
  emptyLabel = 'Nothing here',
}: GenericListProps<T>) {
  if (items.length === 0) {
    return <div className="task-list-count">{emptyLabel}</div>
  }
  return (
    <ul className="task-list">
      {items.map((item, i) => (
        <li key={i}>{renderItem(item, i)}</li>
      ))}
    </ul>
  )
}
