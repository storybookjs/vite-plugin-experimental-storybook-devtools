# Vite Component Highlighter Plugin

A Vite plugin that instruments React, Vue, and Nuxt SSR components to provide visual highlighting and **automatic Storybook story generation** during development. Hover over components in your running app to see their details and create stories with a single click.

## Features

- **Component Highlighting** - Visual overlay on React, Vue, and Nuxt SSR components with configurable colors
- **One-Click Story Generation** - Create Storybook stories directly from your running app
- **Interaction Recording** - Record user interactions and generate stories with play functions
- **Props Serialization** - Properly serializes JSX children, Vue slots, nested components, and reactive objects
- **Append to Existing Stories** - Add new story variants to existing story files
- **Smart Imports** - Automatically resolves and adds component imports
- **DevTools Integration** - Built-in Vite DevTools Kit dock panel with Storybook, Coverage, Terminal, and Docs tabs
- **Coverage Dashboard** - Track story coverage across all detected components
- **Copy Prompt** - Copy LLM-friendly component context to clipboard for AI-assisted development
- **Performance Optimized** - Only active in development, tree-shaken in production
- **Keyboard Shortcuts** - Quick toggles and navigation

## Installation

```bash
npm install vite-plugin-experimental-storybook-devtools
# or
pnpm add vite-plugin-experimental-storybook-devtools
# or
yarn add vite-plugin-experimental-storybook-devtools
```

### Peer Dependencies

This plugin requires:
- `vite` >= 5.0.0
- `@vitejs/devtools` >= 0.1.0
- One of: `react` >= 18.0.0 or `vue` >= 3.0.0

## Quick Start

### React

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DevTools } from '@vitejs/devtools'
import componentHighlighter from 'vite-plugin-experimental-storybook-devtools/react'

export default defineConfig({
  plugins: [
    react(),
    DevTools(),
    componentHighlighter(),
  ],
})
```

### Vue

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { DevTools } from '@vitejs/devtools'
import componentHighlighter from 'vite-plugin-experimental-storybook-devtools/vue'

export default defineConfig({
  plugins: [
    vue(),
    DevTools(),
    componentHighlighter(),
  ],
})
```

### Nuxt SSR

```typescript
// nuxt.config.ts
import { DevTools } from '@vitejs/devtools'
import { defineNuxtConfig } from 'nuxt/config'
import componentHighlighter, {
  getNuxtDevToolsHookScript,
  getNuxtViteDevToolsInjectionScript,
} from 'vite-plugin-experimental-storybook-devtools/nuxt'

export default defineNuxtConfig({
  ssr: true,
  app: {
    head: {
      script: [
        {
          innerHTML: getNuxtDevToolsHookScript(),
          tagPosition: 'head',
        },
        {
          type: 'module',
          innerHTML: getNuxtViteDevToolsInjectionScript(),
          tagPosition: 'bodyClose',
        },
      ],
    },
  },
  vite: {
    server: {
      host: '127.0.0.1',
    },
    devtools: {
      enabled: true,
      clientAuth: false,
    },
    plugins: [DevTools(), componentHighlighter()],
  },
})
```

Nuxt SSR uses the Vue component runtime, but Nuxt does not rely on Vite's
`transformIndexHtml` hook for its rendered HTML. Add the first script so the
Vue devtools hook exists before hydration mounts the client app, and add the
module script so the embedded Vite DevTools dock is mounted. The playground
also pins `vite.server.host` to `127.0.0.1` so the page and DevTools websocket
use the same host. When running Storybook for Nuxt components, omit the
DevTools plugin, component highlighter plugin, and head scripts from the
Storybook process.

### Start developing

```bash
npm run dev
```

Open Vite DevTools (floating button, usually bottom-right) and activate the **Component Highlighter** dock entry.

Once the dock is active:
- **Hover** over any component to see its highlight and tooltip
- **Click** on a component to open the context menu
- **Press Alt/Option** to toggle click-through mode (interact with the app underneath highlights)
- **Create stories** with a single click

## Usage

### Highlight Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| **Hover** | Mouse over | Highlights single component under cursor |
| **Click-through** | Press `Alt/Option` | Toggles click-through mode so you can interact with the app underneath highlights |
| **Clear Selection** | `Escape` | Clears current component selection |
| **Exit Highlighting** | `Escape` x2 (within 600ms) | Turns off highlight mode entirely |

### Highlight Colors

- **Pink solid border** - Currently hovered component
- **Pink dashed border** - Other instances of the same component type
- **Pink background (20%)** - Selected component (context menu open)

### Context Menu

Click on a highlighted component to open the context menu, which provides:

**Action buttons (top row):**
1. **Open Code** - Opens the component source file in your editor
2. **Copy Prompt** - Copies an LLM-friendly prompt with component name, file path, current props, and story status to clipboard
3. **Open Story** - Opens the story file in your editor (disabled if no story exists yet)
4. **View Story** - Navigates to the story in the embedded Storybook panel

**Properties section:**
- Displays all current props with type-colored badges (strings, numbers, booleans, functions, objects, JSX/slots)
- Expandable object viewer with copy buttons
- Collapsible props section

**Story creation:**
- **Story name input** - Pre-filled with a smart suggestion based on props (variant, type, size, etc.)
- **Create** - Generates a story file with the current props
- **Create with Interactions** - Records user interactions (clicks, typing, selections) and generates a story with a play function

### Creating Stories

1. **Click on a highlighted component** to open the context menu
2. **Enter a story name** (auto-suggested based on meaningful props like variant, size, type)
3. **Click "Create"** to generate a story with current props
4. Or **click "Create with Interactions"** to record interactions first, then click the stop button to save

The story file is created at `<component-dir>/<ComponentName>.stories.{ts,tsx}` (`.ts` for Vue, `.tsx` for React). If the file already exists, a new named export is appended.

### Coverage Dashboard

The DevTools panel includes a **Coverage** tab that shows:
- A progress bar with color-coded coverage percentage
- A table of all detected components with their story status
- **Create all** button - Creates stories for all visible component instances on screen, deduplicating by props fingerprint
- Per-component create buttons for individual story generation
- Visibility indicators showing which components are currently rendered

### DevTools Panel Tabs

| Tab | Description |
|-----|-------------|
| **Storybook** | Embedded Storybook iframe with start/status controls |
| **Coverage** | Component story coverage dashboard with bulk creation |
| **Terminal** | Live Storybook process output with error highlighting |
| **Docs** | Embedded Storybook documentation |

## Configuration

```typescript
componentHighlighter({
  // Glob patterns for files to instrument
  include: ['**/*.{tsx,jsx}'],     // React
  include: ['**/*.vue'],           // Vue / Nuxt

  // Glob patterns to exclude
  exclude: ['**/node_modules/**', '**/dist/**'],

  // Subdirectory for generated story files (relative to component)
  storiesDir: undefined,

  // Enable debug logging
  debugMode: false,

  // Force instrumentation in production (default: false)
  force: false,

  // Single-React enforcement for the prop serializer (React only).
  // 'auto' (default) | true | false  — see "React version support" below.
  dedupeReact: 'auto',

  // React Server Components mode (React only, default: false).
  // When true, only modules with a "use client" directive are instrumented
  // (for Vite-based RSC frameworks like TanStack Start). Leave false for SPAs.
  // See "React Server Components" in docs/REACT_PATTERNS.md.
  rsc: false,
})
```

### React version support (18 and 19)

React detection is non-intrusive — it reads the live React fiber tree via the
DevTools global hook and never wraps your components, so the rendered tree
stays clean and RSC keeps working. **React 18 and 19 are both supported and
covered by E2E.**

Which authoring patterns are detected (named/default exports, `memo`/
`forwardRef`, `React.memo` member form, class components, generics, compound,
barrel re-exports, every prop kind), the documented limitations (anonymous
default exports, arbitrary custom HOCs), and **React Server Components support
via the `rsc` option** (a `"use client"` gate for Vite-based RSC frameworks
like TanStack Start) are all in
**[docs/REACT_PATTERNS.md](./docs/REACT_PATTERNS.md)**.

One detail matters for prop-serialization fidelity. The plugin's bundled
`react-element-to-jsx-string` resolves *its own* React copy. If that major
differs from your app's React (e.g. your app is on React 18 but the plugin's
copy is 19), the library's internal `React.isValidElement` rejects your
elements and serialized props silently degrade to a "Failed to serialize"
placeholder. Forcing a single React instance via Vite's `resolve.dedupe`
fixes it.

The `dedupeReact` option controls this:

| Value | Behavior |
|-------|----------|
| `'auto'` *(default)* | Detects a React major mismatch and adds `react`/`react-dom` to `resolve.dedupe` **only when needed**. Single-version apps (the common React 19 case) get **no config mutation at all**. |
| `true` | Always dedupe. |
| `false` | Never dedupe. For advanced setups that intentionally run multiple React copies (module federation / micro-frontends). If a mismatch is detected while disabled, a one-line warning is logged — it never fails silently. |

If you set `dedupeReact: false` and need the fix manually, add this to your
Vite config:

```ts
// vite.config.ts
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
})
```

### Default Exclusions

The following patterns are excluded by default:
- `**/node_modules/**`
- `**/dist/**`
- `**/*.d.ts`
- `**/*.stories.*`
- `**/stories.*`
- `**/*.story.*`
- `**/story.*`

## Generated Story Format

### React

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import MyButton from './MyButton';
import Icon from './Icon';

const meta: Meta<typeof MyButton> = {
  component: MyButton,
};

export default meta;
type Story = StoryObj<typeof MyButton>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    label: 'Click me',
    icon: <Icon name="star" />,
    onClick: fn(),
  },
};
```

### Vue

```typescript
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from './Button.vue';

const meta: Meta<typeof Button> = {
  component: Button,
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Secondary: Story = {
  render: (args) => ({
    components: { Button },
    setup() {
      const componentArgs = Object.fromEntries(
        Object.entries(args).filter(([key]) => !key.startsWith('slot:')),
      );
      return { componentArgs };
    },
    template: `<Button v-bind="componentArgs">Click me</Button>`,
  }),
  args: {
    variant: 'secondary',
    size: 'default',
  },
};
```

### Supported Prop Types

| Type | React | Vue | Generated Code |
|------|-------|-----|----------------|
| Primitives | `"hello"`, `42`, `true` | Same | Direct values |
| Objects | `{ nested: { value: 1 } }` | Reactive objects auto-unwrapped | `{ nested: { value: 1 } }` |
| Arrays | `[1, 2, 3]` | Same | `[1, 2, 3]` |
| JSX Elements | `<Icon />` | N/A | `<Icon />` (with import) |
| Vue Slots | N/A | `<slot />` | Template syntax in render function |
| Functions | `onClick={handler}` | `@click="handler"` | `fn()` (with import) |
| Children | `<>Hello <Button /></>` | Default slot content | Framework-specific syntax |

## Architecture

For detailed technical documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
+-----------------+    +------------------+    +-----------------+
|   Vite Plugin   |    | Runtime Module   |    |  DevTools Dock  |
|                 |    |                  |    |                 |
| - Transform     |--->| - Registration   |--->| - Panel UI      |
| - Inject meta   |    | - Registry       |    | - RPC Handler   |
| - Endpoints     |    | - Serialization  |    | - Story create  |
+-----------------+    +------------------+    +-----------------+
                             |                         |
                             v                         v
                  +------------------+    +---------------------+
                  | Client Overlay   |    | Framework Story Gen |
                  | - Highlights     |    | - React generator   |
                  | - Context menu   |    | - Vue generator     |
                  | - Interactions   |    | - Shared utilities  |
                  +------------------+    +---------------------+
```

### How It Works

1. **Build-time**: Non-intrusive transforms tag modules without wrapping or reconstructing components (React: a Babel `__chRegisterMeta` tag; Vue: a single idempotent runtime-import added to the SFC script block)
2. **Runtime**: Detection is driven by each framework's DevTools global hook — React walks the live fiber tree on commit; Vue subscribes to `component:added/updated/removed`. Both read native source identity (React from the build-time tag, Vue from `instance.type.__file`/`__name`) and register instances with metadata, props, and DOM elements. No component is wrapped.
3. **Interaction**: Client overlay renders highlights on hover/click, shows context menu with props and actions
4. **Story Creation**: Serialized props are sent via DevTools RPC to the server plugin, which dynamically loads the framework-specific story generator and writes story files to disk
5. **Interaction Recording**: User actions are captured as an ordered list of steps, then formatted into a Storybook play function

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Mod+Shift+H` | Toggle component highlighter (via command palette) |
| `Alt/Option` (press) | Toggle click-through mode (interact with app underneath highlights) |
| `Escape` | Clear selection / close context menu |
| `Escape` x2 (within 600ms) | Exit highlight mode entirely |
| `Enter` (in story name input) | Create story |

## Development

### Setup

```bash
git clone https://github.com/storybookjs/vite-plugin-storybook-devtools.git
cd vite-plugin-storybook-devtools

pnpm install
```

### Available Scripts

```bash
# Run React playground
pnpm --filter playground-react dev

# Run Vue playground
pnpm --filter playground-vue dev

# Run unit tests
pnpm test

# Run E2E tests (starts playgrounds automatically)
pnpm exec playwright test

# Build the library
pnpm build

# Type check
pnpm typecheck
```

### Project Structure

```
src/
  create-component-highlighter-plugin.ts  # Main Vite plugin (server endpoints, RPC, transforms)
  runtime-helpers.ts                      # Shared runtime utilities (DOM tracking, observers)
  coverage-dashboard.ts                   # Server-side coverage computation
  notifications.ts                        # Notification abstraction (DevTools logs + console)
  shared-types.ts                         # Shared types for server/client RPC transfer
  frameworks/
    types.ts                              # Shared framework interfaces
    react/
      plugin.ts                           # React entry point
      index.ts                            # React framework config
      transform.ts                        # Babel AST tag (__chRegisterMeta, non-wrapping)
      devtools-hook.ts                    # Inline <head> React DevTools hook bootstrap
      runtime-module.ts                   # Fiber-tree walker + registration
      story-generator.ts                  # React story generation
    vue/
      plugin.ts                           # Vue entry point
      index.ts                            # Vue framework config
      transform.ts                        # Idempotent runtime-import tag (no SFC rebuild)
      devtools-hook.ts                    # Inline <head> Vue DevTools hook bootstrap
      runtime-module.ts                   # DevTools-hook event reconciler + registration
      story-generator.ts                  # Vue story generation
      vnode-to-template.ts               # VNode to template serialization
  client/
    overlay.ts                            # Highlight UI, story file cache, save actions
    context-menu.ts                       # Context menu (Shadow DOM), props display, actions
    listeners.ts                          # Mouse/keyboard event handlers, highlight mode state
    vite-devtools.ts                      # DevTools dock lifecycle (activate/deactivate)
    interaction-recorder.ts               # User interaction recording for play functions
    coverage-actions.ts                   # Client-side coverage actions (scroll, highlight)
    logger.ts                             # Debug logging utility
    utils/
      format-utils.ts                     # Value formatting helpers for context menu
      html-preview.ts                     # HTML preview rendering for prop values
      prop-utils.ts                       # Prop type detection and badge utilities
  codegen/
    interactions-to-code.ts               # Converts recorded interactions to play function code
    generate-query.ts                     # Generates Testing Library queries from targets
    args-to-string.ts                     # Serializes args objects to source code strings
    combine-interactions.ts               # Combines/deduplicates sequential interaction steps
    get-interaction-event.ts              # Maps DOM events to interaction event types
    types.ts                              # Codegen type definitions
  panel/
    panel.ts                              # DevTools panel (Storybook, Coverage, Terminal, Docs tabs)
    panel.css                             # Panel styles
    index.html                            # Panel HTML shell
  utils/
    story-generator.ts                    # Shared story generation utilities
e2e/
  highlighter-helpers.ts                  # Shared E2E helper functions
  common-highlighter-suite.ts             # Shared test suite (framework playgrounds)
  component-highlighter.spec.ts           # Highlighter interaction tests
  playground-react-detection.spec.ts      # React-specific detection tests
  playground-vue-detection.spec.ts        # Vue-specific detection tests
playground/
  react/                                  # React development app
  vue/                                    # Vue development app
```

## Limitations

- **Framework scope** - Currently supports React, Vue, and Nuxt SSR through the Vue integration
- **Development only** - Disabled in production builds by default
- **Vite DevTools required** - Needs `@vitejs/devtools` for the dock panel and RPC
- **Function components** - Class components are not supported
- **Provider dependencies** - Components requiring context providers may need Storybook decorators

## Troubleshooting

### Stories aren't being created

1. Ensure the DevTools dock is open and the Component Highlighter entry is active
2. Check the browser console for errors
3. Verify the output path is writable

### Components not being highlighted

1. Ensure the file matches the `include` patterns
2. Check that it's not matching an `exclude` pattern
3. Verify the component is a function component (class components are not supported)
4. For Vue, ensure the component has a `<script setup>` or `<script>` block

### Story generation produces wrong imports

1. Check that component references are in the live registry (rendered on screen)
2. Vue components need the `.vue` extension in the import path

## License

MIT
