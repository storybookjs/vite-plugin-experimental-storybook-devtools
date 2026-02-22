# Architecture Documentation

> **For AI Agents**: This document describes the technical architecture of the Vite Component Highlighter Plugin.
> Use this as a reference when understanding, modifying, or extending the codebase.

## Overview

This plugin instruments component-based applications at build-time to enable runtime component highlighting and automatic Storybook story generation. It integrates with Vite DevTools Kit to provide a seamless developer experience.

**Import from a framework-specific path:**
```typescript
// For React
import componentHighlighter from 'vite-plugin-experimental-storybook-devtools/react'

// Future frameworks will follow the same pattern:
// import componentHighlighter from 'vite-plugin-experimental-storybook-devtools/vue'
// import componentHighlighter from 'vite-plugin-experimental-storybook-devtools/svelte'
```

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VITE BUILD PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │   User's JSX/TSX │───▶│   transform.ts   │───▶│  Instrumented Code   │   │
│  │   Components     │    │   (Babel AST)    │    │  with HOC wrapper    │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER RUNTIME                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │  virtual runtime │    │   listeners.ts   │    │     overlay.ts       │   │
│  │  module (HOC)    │───▶│  (event mgmt)    │───▶│   (UI rendering)     │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────────┘   │
│         │                                                   │               │
│         ▼                                                   ▼               │
│  ┌──────────────────┐                          ┌──────────────────────┐     │
│  │ Component        │                          │  Context Menu UI     │     │
│  │ Registry (Map)   │                          │  - Props display     │     │
│  │ - meta           │                          │  - Story name input  │     │
│  │ - props          │                          │  - Create/Add Story  │     │
│  │ - element ref    │                          │  - Open Component    │     │
│  └──────────────────┘                          │  - Open Stories      │     │
│                                                └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VITE DEVTOOLS DOCK (iframe)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐         RPC          ┌──────────────────────────┐     │
│  │ vite-devtools.ts │◀────────────────────▶│ component-highlighter-   │     │
│  │ (Dock UI client) │                      │ plugin.ts (Server)       │     │
│  └──────────────────┘                      └──────────────────────────┘     │
│                                                        │                    │
│                                                        ▼                    │
│                                             ┌──────────────────────────┐    │
│                                             │   story-generator.ts     │    │
│                                             │   - Generate .stories.tsx│    │
│                                             │   - Handle JSX props     │    │
│                                             │   - Resolve imports      │    │
│                                             └──────────────────────────┘    │
│                                                        │                    │
│                                                        ▼                    │
│                                             ┌──────────────────────────┐    │
│                                             │   File System            │    │
│                                             │   - Write story files    │    │
│                                             │   - Append to existing   │    │
│                                             └──────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. `component-highlighter-plugin.ts` (Server-Side)

**Purpose**: Main Vite plugin entry point. Handles plugin registration, DevTools integration, and server-side story generation.

**Key Responsibilities**:
- Register Vite plugin with `transform` hook
- Set up Vite DevTools Kit dock panel
- Register RPC handlers for client-server communication
- Handle `/__component-highlighter/check-story` endpoint
- Handle `/__open-in-editor` endpoint
- Serve runtime virtual modules (dev TS with HMR, build JS from `dist`)
- Invoke `utils/story-generator.ts` to create story files
- Send WebSocket notifications on story creation

**RPC Methods**:
- `component-highlighter:create-story` - Creates/appends story files
- `component-highlighter:toggle-overlay` - Toggle highlight mode

### 2. `frameworks/react/transform.ts` (Build-Time)

**Purpose**: Babel-based AST transformation that instruments React components with the HOC wrapper.

**Key Responsibilities**:
- Parse JSX/TSX files using Babel
- Identify React component declarations (function, arrow, memo, forwardRef)
- Wrap components with `withComponentHighlighter` HOC
- Inject metadata: `componentName`, `filePath`, `relativeFilePath`, `sourceId`, `isDefaultExport`
- Calculate unique `sourceId` hash for each component
- Skip non-component functions

**Transformation Example**:
```typescript
// Input
export function MyButton({ label }) {
  return <button>{label}</button>
}

// Output
export const MyButton = withComponentHighlighter(
  function MyButton({ label }) {
    return <button>{label}</button>
  },
  {
    componentName: 'MyButton',
    filePath: '/abs/path/to/MyButton.tsx',
    relativeFilePath: 'src/MyButton.tsx',
    sourceId: 'abc123',
    isDefaultExport: false,
  }
)
```

### 3. `frameworks/react/runtime-module.ts` (Runtime)

**Purpose**: Runtime code injected into the browser (via a virtual module). Contains the HOC implementation and prop serialization logic.

**Key Responsibilities**:
- Implement `withComponentHighlighter` HOC
- Create boundary DOM elements for hover detection
- Maintain component registry (Map of instances)
- Serialize props including JSX children using `react-element-to-jsx-string`
- Dispatch custom events for component lifecycle (register, unregister, update-props)
- Extract component references for import resolution

**Runtime loading behavior**:
- **Dev**: loads `src/frameworks/*/runtime-module.ts`, transforms with Vite, and supports HMR
- **Build/Publish**: loads compiled JS from `dist/frameworks/*/runtime-module.mjs`

### 4. `runtime-helpers.ts` (Shared Runtime Utilities)

**Purpose**: Shared runtime helpers used by both React and Vue runtimes.

**Key Responsibilities**:
- Resolve trackable DOM elements (skip `display: contents` or zero-size roots)
- Attach Mutation/Resize observers for rect updates
- Shared register/update/cleanup orchestration for component tracking

**ComponentInstance Interface**:
```typescript
interface ComponentInstance {
  id: string                    // Unique instance ID
  meta: ComponentMeta           // Static metadata from transform
  props: Record<string, unknown>// Current props (live)
  serializedProps?: SerializedProps // Props serialized for story generation
  element: HTMLElement          // DOM reference for positioning
  rect?: DOMRect               // Cached bounding rect
}
```

### 5. `overlay.ts` (Client-Side UI)

**Purpose**: Manages the visual overlay, highlights, hover menus, and context menus.

**Key Responsibilities**:
- Create/manage highlight container (`#component-highlighter-container`)
- Render DOM-based highlight elements (not canvas)
- Handle highlight colors: blue (other), pink (hovered), pink-dashed (same type)
- Show/hide hover tooltip on mouse movement
- Show context menu on highlight click with:
  - Component name and relative path
  - Props display
  - Story name input with auto-suggestion
  - "Create Story" / "Add Story" button
  - "Open Component" / "Open Stories" buttons
- Check story file existence via server endpoint
- Show Storybook icon badge for components with stories
- Show debug overlay with component stats when Alt is held

**Highlight Types**:
- `other`: Non-hovered components (blue, 5% bg opacity)
- `hovered`: Currently hovered (pink solid, 5% bg opacity)
- `sameType`: Same component name (pink dashed, 5% bg opacity)
- `selected`: Clicked/selected (pink solid, 20% bg opacity)

### 6. `listeners.ts` (Client-Side Events)

**Purpose**: Event handling and component registry management.

**Key Responsibilities**:
- Listen for component registration/unregistration events
- Handle mouse movement for hover detection
- Handle keyboard shortcuts (Alt for highlight-all, Shift+H for toggle, Escape for dismiss)
- Track dock active state (`isDockActive`)
- Coordinate with overlay module for UI updates
- Export `enableHighlightMode()` / `disableHighlightMode()` for DevTools control

### 7. `vite-devtools.ts` (Dock Client)

**Purpose**: Client-side script running inside the Vite DevTools dock iframe.

**Key Responsibilities**:
- Listen for `log-info` events from overlay
- Call RPC to create stories on server
- Handle story creation success/failure feedback
- Listen for `component-highlighter:story-created` WebSocket events

### 8. `utils/story-generator.ts` (Server-Side)

**Purpose**: Generate Storybook `.stories.tsx` file content.

**Key Responsibilities**:
- Generate story file content with proper imports
- Handle JSX props serialization to code
- Resolve component imports from registry
- Format prop values (primitives, objects, arrays, JSX, functions)
- Generate unique story names (avoid duplicates)
- Append stories to existing files
- Add `fn()` import for function props

**Generated Story Structure**:
```typescript
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import MyButton from './MyButton';
import Icon from './Icon';

const meta = {
  title: 'Components/MyButton',
  component: MyButton,
} satisfies Meta<typeof MyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    label: 'Click me',
    icon: <Icon name="star" />,
    onClick: fn(),
  },
};
```

### 9. `utils/provider-analyzer.ts` (Server-Side, Standalone)

**Purpose**: Analyze app entry points to detect provider dependencies for Storybook decorator setup.

**Key Responsibilities**:
- Find app entry point (App.tsx, main.tsx, etc.)
- Parse and traverse AST for provider patterns
- Detect known providers (Redux, Router, Emotion, etc.)
- Detect custom context usage
- Generate decorator suggestions
- Log findings for developer awareness

## Data Flow

### Component Registration Flow
```
1. Build: transform.ts wraps component with HOC
2. Runtime: Component mounts → HOC creates boundary element
3. Runtime: HOC dispatches 'component-highlighter:register' event
4. Runtime: listeners.ts receives event, adds to registry Map
5. Runtime: overlay.ts can now render highlights
```

### Story Creation Flow
```
1. User hovers component → overlay shows tooltip
2. User clicks highlight → overlay shows context menu
3. User enters story name, clicks "Create Story"
4. overlay.ts emits 'log-info' event with serialized data
5. vite-devtools.ts receives event, calls RPC
6. component-highlighter-plugin.ts receives RPC call
7. utils/story-generator.ts generates story content
8. Plugin writes file to disk
9. Plugin sends WebSocket notification
10. vite-devtools.ts shows success feedback
11. overlay.ts updates UI (enables "Open Stories" button)
```

### Highlight Drawing Flow
```
1. listeners.ts: handleMouseMove triggered
2. listeners.ts: findComponentAtPoint() queries registry
3. listeners.ts: calls updateHover(instanceId)
4. overlay.ts: drawAllHighlights() called
5. overlay.ts: For each component, create/update DOM highlight element
6. overlay.ts: Apply appropriate styles based on highlight type
```

## Key Interfaces

### ComponentMeta (Static, from transform)
```typescript
interface ComponentMeta {
  componentName: string      // 'MyButton'
  filePath: string          // '/abs/path/to/MyButton.tsx'
  relativeFilePath?: string // 'src/MyButton.tsx'
  sourceId: string          // Hash of filePath + componentName
  isDefaultExport: boolean
}
```

### SerializedProps (For story generation)
```typescript
interface SerializedProps {
  [key: string]: SerializedValue
}

type SerializedValue =
  | string | number | boolean | null | undefined
  | { __isJSX: true; source: string; componentRefs: string[] }
  | { __isFunction: true; name: string }
  | { __isArray: true; items: SerializedValue[] }
  | { [key: string]: SerializedValue }
```

### DetectedProvider (From provider-analyzer)
```typescript
interface DetectedProvider {
  type: ProviderType | 'customContext'
  source: string                    // e.g., "useSelector() hook"
  confidence: 'high' | 'medium' | 'low'
  location?: { file: string; line?: number }
  suggestedDecorator?: string
  requiredImports?: string[]
  docsUrl?: string
}
```

## File Structure
```
src/
├── index.ts                      # Core exports (types, utilities)
├── create-component-highlighter-plugin.ts # Plugin factory (createComponentHighlighterPlugin)
├── runtime-helpers.ts            # Shared runtime utilities
├── storybook-icon.svg            # Icon for DevTools dock
│
├── frameworks/                   # Multi-framework support
│   ├── types.ts                  # Shared interfaces (ComponentMeta, etc.)
│   ├── index.ts                  # Type exports only
│   └── react/                    # React-specific implementation
│       ├── index.ts              # React framework config
│       ├── plugin.ts             # React entry point: import from '/react'
│       ├── transform.ts          # Babel AST transformation
│       └── runtime-module.ts     # HOC and serialization runtime
│
├── client/                       # Framework-agnostic client code
│   ├── overlay.ts                # UI overlay and context menu
│   ├── listeners.ts              # Event handlers and registry
│   └── vite-devtools.ts          # DevTools dock client
│
└── utils/                        # Utility functions
    ├── story-generator.ts        # Story file generation
    └── provider-analyzer.ts      # Provider dependency detection

tests/
├── transform.test.ts             # Unit tests for transform
└── story-generator.test.ts       # Unit tests for story generation

e2e/
└── component-highlighter.spec.ts # Playwright E2E tests

playground/
└── src/                          # Test app for development
```

### Framework Architecture

The codebase is structured for multi-framework support:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Framework Abstraction                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    frameworks/types.ts                         │ │
│  │  - ComponentMeta, ComponentInstance, SerializedProps           │ │
│  │  - FrameworkConfig, TransformFunction                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                 │                                   │
│                                 ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    frameworks/index.ts                         │ │
│  │  - Framework registry (Map<name, FrameworkConfig>)             │ │
│  │  - detectFramework(code, id) → FrameworkConfig                 │ │
│  │  - getFramework(name) → FrameworkConfig                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                 │                                   │
│         ┌───────────────────────┼───────────────────────┐           │
│         ▼                       ▼                       ▼           │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐     │
│  │    React     │       │     Vue      │       │   Svelte     │     │
│  │  (current)   │       │   (future)   │       │   (future)   │     │
│  ├──────────────┤       ├──────────────┤       ├──────────────┤     │
│  │ transform.ts │       │ transform.ts │       │ transform.ts │     │
│  │ runtime-     │       │ runtime-     │       │ runtime-     │     │
│  │ module.ts    │       │ module.ts    │       │ module.ts    │     │
│  │ index.ts     │       │ index.ts     │       │ index.ts     │     │
│  └──────────────┘       └──────────────┘       └──────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**FrameworkConfig Interface**:
```typescript
interface FrameworkConfig {
  name: string                    // 'react', 'vue', 'svelte'
  displayName: string             // 'React', 'Vue', 'Svelte'
  extensions: string[]            // ['.tsx', '.jsx']
  detect: FrameworkDetector       // (code, id) => boolean
  transform: TransformFunction    // (code, id) => string | undefined
  runtimeModuleFile: string        // 'frameworks/react/runtime-module'
  virtualModuleId: string         // 'virtual:component-highlighter/runtime'
  storybookFramework: string      // '@storybook/react-vite'
}
```

**Adding a New Framework** (e.g., Vue):
1. Create `src/frameworks/vue/` directory
2. Implement `transform.ts` with Vue-specific AST transformation
3. Implement `runtime-module.ts` with Vue-specific wrapper runtime
4. Create `index.ts` exporting a `FrameworkConfig`
5. Create `plugin.ts` as the entry point:
   ```typescript
   import { createComponentHighlighterPlugin } from '../../create-component-highlighter-plugin'
   import { vueFramework } from '.'

   export default function componentHighlighterVue(options = {}) {
     return createComponentHighlighterPlugin(vueFramework, options)
   }
   ```
6. Add entry to `tsdown.config.ts` and `package.json` exports

## Configuration Options

```typescript
interface PluginOptions {
  include?: string[]      // Glob patterns to include (default: ['**/*.{tsx,jsx}'])
  exclude?: string[]      // Glob patterns to exclude
  eventName?: string      // Custom event name for story creation
  enableOverlay?: boolean // Enable overlay in development (default: true)
  devtoolsDockId?: string // Custom DevTools dock ID
  force?: boolean         // Force instrumentation in production
}
```

## Extension Points

### Adding New Provider Detection
1. Add pattern to `PROVIDER_PATTERNS` in `utils/provider-analyzer.ts`
2. Include packages, hooks, components, decorator suggestion, and docs URL

### Adding New Prop Serialization
1. Modify `serializeValue()` in `frameworks/react/runtime-module.ts`
2. Add corresponding handling in `formatPropValue()` in `utils/story-generator.ts`

### Customizing Story Generation
1. Modify `generateStoryContent()` in `utils/story-generator.ts`
2. Update imports, meta structure, or story format as needed

---

## Future Steps: Multi-Framework Support

### Vue Support

**Challenges**:
- Vue uses Single File Components (SFC) with `<script setup>` syntax
- Component props are defined differently (defineProps, Options API)
- Template syntax differs from JSX

**Approach**:
1. Create `transform-vue.ts` using `@vue/compiler-sfc`
2. Parse `<script>` and `<script setup>` blocks
3. Wrap component export with Vue-compatible HOC or use provide/inject
4. Modify Vue-specific runtime to support Vue's reactivity system
5. Generate `.stories.ts` for Vue components

**Key Differences**:
```typescript
// Vue story format
import type { Meta, StoryObj } from '@storybook/vue3'
import MyButton from './MyButton.vue'

const meta = {
  component: MyButton,
} satisfies Meta<typeof MyButton>

export const Primary: StoryObj<typeof meta> = {
  args: { label: 'Click me' },
}
```

### Angular Support

**Challenges**:
- Angular uses decorators and TypeScript classes
- Components are decorated with `@Component`
- Templates can be inline or external files
- Dependency injection is fundamental

**Approach**:
1. Create `transform-angular.ts` using TypeScript compiler API
2. Parse class decorators to find `@Component`
3. Extract inputs/outputs from decorator metadata
4. Use Angular's component hooks for registration
5. Generate `.stories.ts` with Angular-specific format

**Key Differences**:
```typescript
// Angular story format
import type { Meta, StoryObj } from '@storybook/angular'
import { MyButtonComponent } from './my-button.component'

const meta: Meta<MyButtonComponent> = {
  component: MyButtonComponent,
}

export const Primary: StoryObj<MyButtonComponent> = {
  args: { label: 'Click me' },
}
```

### Svelte Support

**Challenges**:
- Svelte compiles away at build time
- Props are defined with `export let`
- Reactive statements and stores are unique to Svelte

**Approach**:
1. Create `transform-svelte.ts` using `svelte/compiler`
2. Parse component script for `export let` declarations
3. Wrap component or use Svelte actions for registration
4. Handle Svelte stores for prop serialization
5. Generate `.stories.ts` with Svelte format

**Key Differences**:
```typescript
// Svelte story format
import type { Meta, StoryObj } from '@storybook/svelte'
import MyButton from './MyButton.svelte'

const meta = {
  component: MyButton,
} satisfies Meta<typeof MyButton>

export const Primary: StoryObj<typeof meta> = {
  args: { label: 'Click me' },
}
```

### Shared Infrastructure

**What can be reused**:
- `component-highlighter-plugin.ts` - Vite plugin structure
- `story-generator.ts` - Core generation logic (with framework adapters)
- `provider-analyzer.ts` - Provider detection patterns
- `client/overlay.ts` - UI overlay (framework-agnostic DOM manipulation)
- `client/listeners.ts` - Event handling (framework-agnostic)

**What needs per-framework implementation**:
- Transform logic (different AST parsers)
- Runtime HOC/wrapper (different component models)
- Prop extraction (different prop systems)
- Template handling (JSX vs templates vs SFC)

### Implementation Priority

1. **Vue** - Second most popular framework, uses Vite natively
2. **Svelte** - Growing ecosystem, Vite-first
3. **Angular** - Large enterprise usage, more complex integration

### Architecture for Multi-Framework

```
src/
├── frameworks/
│   ├── react/
│   │   ├── transform.ts
│   │   └── runtime-module.ts
│   ├── vue/
│   │   ├── transform.ts
│   │   └── runtime-module.ts
│   ├── svelte/
│   │   ├── transform.ts
│   │   └── runtime-module.ts
│   └── angular/
│       ├── transform.ts
│       └── runtime-module.ts
├── shared/
│   ├── overlay.ts
│   ├── story-generator.ts
│   └── provider-analyzer.ts
└── index.ts  # Auto-detect framework
```

