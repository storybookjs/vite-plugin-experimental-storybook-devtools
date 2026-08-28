/**
 * Devframe Entry Point
 *
 * Exports the `storybook-devtools` devframe definition for mounting into a
 * custom Vite DevTools host:
 * ```ts
 * import { createStorybookDevframe } from 'vite-plugin-experimental-storybook-devtools/devframe'
 * ```
 */

export {
  createStorybookDevframe,
  type StorybookDevframeState,
  type CreateStorybookDevframeDeps,
} from './devframe'
