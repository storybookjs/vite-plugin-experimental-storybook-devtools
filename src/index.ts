/**
 * vite-plugin-experimental-storybook-devtools
 *
 * Import from a framework-specific path:
 * ```ts
 * import componentHighlighter from 'vite-plugin-experimental-storybook-devtools/react'
 * ```
 */

// Core plugin factory (for advanced use cases)
export {
  createComponentHighlighterPlugin,
  type ComponentHighlighterOptions,
} from './create-component-highlighter-plugin'

// Story generator
export { generateStoryName } from './utils/story-generator'
export type {
  SerializedProps,
  JSXSerializedValue,
  StoryGenerationData,
  GeneratedStory,
} from './utils/story-generator'

// Framework types
export type {
  ComponentMeta,
  ComponentInstance,
  HighlighterOptions,
  TransformFunction,
  FrameworkDetector,
  FrameworkConfig,
} from './frameworks'

// Notification abstraction
export type {
  Notification,
  NotificationLevel,
  NotificationHandle,
  NotificationService,
} from './notifications'
export {
  ConsoleNotificationService,
  DevToolsNotificationService,
} from './notifications'
