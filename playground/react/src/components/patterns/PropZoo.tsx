import React from 'react'

// PATTERN: a single component exercising many prop *kinds* so the prop
// serializer / story generator is covered broadly.
type Variant =
  | { kind: 'badge'; tone: 'good' | 'bad' }
  | { kind: 'plain'; weight: number }

export interface PropZooProps {
  /** array of primitives */
  tags: string[]
  /** Date object */
  createdAt: Date
  /** inline style object */
  style?: React.CSSProperties
  /** element prop that is NOT children */
  header?: React.ReactNode
  /** function-as-children (render prop) */
  children: (count: number) => React.ReactNode
  /** discriminated union */
  variant: Variant
  /** nullable */
  note: string | null
  /** tuple */
  range: [number, number]
  /** non-plain object (Map): not round-trippable to a story arg */
  lookup?: Map<string, number>
  /** event handler with an argument */
  onPick?: (id: string) => void
}

export function PropZoo({
  tags,
  createdAt,
  style,
  header,
  children,
  variant,
  note,
  range,
  lookup,
  onPick,
}: PropZooProps) {
  return (
    <div className="task-card" style={style}>
      {header}
      <div className="task-card-meta">
        <span>tags: {tags.join(', ')}</span>
        <span>created: {createdAt.toISOString().slice(0, 10)}</span>
        <span>
          variant: {variant.kind}
          {variant.kind === 'badge' ? ` (${variant.tone})` : ` (${variant.weight})`}
        </span>
        <span>range: {range[0]}–{range[1]}</span>
        <span>note: {note ?? '—'}</span>
        <span>lookup: {lookup ? lookup.size : 0}</span>
      </div>
      <button
        className="btn btn-secondary btn-small"
        onClick={() => onPick?.('zoo-1')}
      >
        Pick
      </button>
      <div>{children(range[1] - range[0])}</div>
    </div>
  )
}
