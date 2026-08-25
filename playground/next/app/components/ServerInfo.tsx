// Genuine React Server Component — no "use client" directive, no
// interactivity, reads process info only available on the server. Proves the
// RSC boundary: the `rsc: true` default (App Router ships Server Components
// by default) never tags this module, so it's absent from
// `window.__componentHighlighterRegistry` — verified by
// e2e/playground-next-detection.spec.ts.
export function ServerInfo() {
  return (
    <footer className="server-info">
      Rendered on the server — Node {process.version}, PID {process.pid}
    </footer>
  )
}
