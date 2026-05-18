# Supported Frameworks

> React authoring-pattern support matrix (export styles, wrappers, class,
> generics, prop kinds) and documented limitations:
> [docs/REACT_PATTERNS.md](./REACT_PATTERNS.md).


Keep this file up to date whenever framework integrations are added, removed, or significantly changed.

Current integrations:

- React (`src/frameworks/react`) — **React 18 and 19 are both required and
  verified via dedicated E2E playgrounds** (`playground/react` on 19,
  `playground/react18` on 18; Playwright projects `react-chromium` /
  `react18-chromium`). Both playgrounds share ONE source tree —
  `playground/react18/src` is a symlink to `playground/react/src` — so
  components are authored once and exercised on both React versions.
  Detection is non-intrusive: it reads the live fiber
  tree through the React DevTools global hook and never wraps components. It
  relies only on the reconciler hook contract (identical, typeof-guarded
  across 16.9–19) and fiber fields stable since React 16 (`current/child/
  sibling/type/elementType/memoizedProps/stateNode/alternate`). It
  deliberately does **not** use `_debugSource` (removed in React 19) — exact
  source identity comes from the build-time `__chRegisterMeta` tag, so 18 and
  19 behave identically.
  - Prop-serialization fidelity is part of the React-18 contract. The bundled
    `react-element-to-jsx-string` must bind the *app's* React, else its
    `React.isValidElement` rejects React 18 elements and props degrade to a
    "Failed to serialize" placeholder. The `dedupeReact` option (default
    `'auto'`) adds `react`/`react-dom` to `resolve.dedupe` **only when a
    React-major mismatch is detected** — so React 19 apps get no config
    mutation while React 18 apps are fixed automatically (`false` opts out
    with a warning; never silent). The `react18-chromium` spec asserts no
    degraded fallback and real JSX children source.
- Vue (`src/frameworks/vue`)
