'use client'

export interface HydrationInfoProps {
  /** ISO timestamp computed by the server component that rendered the page. */
  renderedAt: string
}

// Client component whose initial HTML is server-rendered from a
// server-computed prop — the SSR + hydration path the shared SSR suite
// verifies: markup present in the raw payload, no hydration mismatch with
// instrumentation active, instance registered after hydration.
export function HydrationInfo({ renderedAt }: HydrationInfoProps) {
  return (
    <aside className="hydration-info">
      Server-rendered at <time dateTime={renderedAt}>{renderedAt}</time>
    </aside>
  )
}
