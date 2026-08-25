const clientBundleUrl = '/__storybook-devtools-client/vite-devtools.mjs'

// Top-level await defers the app entry until the devtools client (listeners +
// overlay) is wired, giving the E2E suites the same deterministic activation
// the Vite playgrounds get from their eager source imports. The embedded dock
// host later imports the same URL, so the browser module cache keeps a single
// client instance.
await import(/* webpackIgnore: true */ clientBundleUrl).catch(() => {})

export {}
