/**
 * Devframe Entry Point
 *
 * Exports the `storybook-devtools` devframe definition for mounting into a
 * custom Vite DevTools host:
 * ```ts
 * import { createStorybookDevframe } from '@storybook/experimental-devtools/devframe'
 * ```
 */

export {
  createStorybookDevframe,
  type StorybookDevframeState,
  type CreateStorybookDevframeDeps,
} from './devframe'
