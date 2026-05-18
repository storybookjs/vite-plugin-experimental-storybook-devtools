import React, { useRef } from 'react'
// MemoStat is imported THROUGH the barrel on purpose (barrel-resolution test).
import { MemoStat } from './index'
import DefaultBanner from './DefaultBanner'
import IconChip from './IconChip'
import { FancyField } from './FancyField'
import { ReactMemoCard } from './ReactMemoCard'
import { MemoForwardInput } from './MemoForwardInput'
import { LegacyCounter } from './LegacyCounter'
import { GenericList } from './GenericList'
import { Disclosure } from './Disclosure'
import { PropZoo } from './PropZoo'
import { FramedNote } from './FramedNote'
import AnonWidget from './AnonWidget'

// Aggregates every authoring pattern so detection + serialization are
// exercised at runtime. Itself a plain named-function export (detected).
export function PatternShowcase() {
  const fieldRef = useRef<HTMLInputElement>(null)

  return (
    <section className="task-list" data-testid="pattern-showcase">
      <div className="task-list-header">
        <h2 className="task-list-title">Pattern Showcase</h2>
      </div>

      <DefaultBanner message="default function export" tone="info" />
      <IconChip icon={<span>★</span>} label="default via identifier" />
      <MemoStat label="memo()" value={42} />
      <FancyField ref={fieldRef} label="forwardRef()" placeholder="ref input" />
      <ReactMemoCard title="React.memo member form" body="member wrapper" />
      <MemoForwardInput label="memo(forwardRef())" placeholder="combo" />
      <LegacyCounter label="class component" step={2} />

      <GenericList
        items={['alpha', 'beta', 'gamma']}
        renderItem={(item, i) => (
          <span className="task-card-meta">
            {i}: {item}
          </span>
        )}
      />

      <Disclosure title="compound (dot-notation)" defaultOpen>
        <span>Disclosure.Panel content</span>
      </Disclosure>

      <PropZoo
        tags={['x', 'y', 'z']}
        createdAt={new Date('2026-01-01T00:00:00.000Z')}
        style={{ opacity: 0.95 }}
        header={<strong>PropZoo header (element prop)</strong>}
        variant={{ kind: 'badge', tone: 'good' }}
        note={null}
        range={[2, 9]}
        onPick={(id) => console.log('picked', id)}
      >
        {(count) => <em>render-prop children: {count}</em>}
      </PropZoo>

      {/* Unsupported-detection demonstrators (render fine, not registered) */}
      <FramedNote text="custom HOC result" />
      <AnonWidget />
    </section>
  )
}
