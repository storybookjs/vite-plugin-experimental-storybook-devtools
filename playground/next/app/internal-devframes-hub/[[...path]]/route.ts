import { createStorybookDevtoolsRoute } from 'vite-plugin-experimental-storybook-devtools/next'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const route = createStorybookDevtoolsRoute({
  // E2E must not require interactive Vite DevTools authorization.
  auth: false,
  // Pinned to avoid CI collisions with other playgrounds' sidecar servers.
  port: 9778,
  // Matches `next dev -H 127.0.0.1` — 'localhost' can resolve to the IPv6
  // loopback, which the browser's explicit ws://127.0.0.1 target can't reach.
  host: '127.0.0.1',
})

export const { GET, POST, DELETE } = route
