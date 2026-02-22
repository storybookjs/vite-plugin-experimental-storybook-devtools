/**
 * Vue Framework Configuration
 *
 * Exports the Vue-specific implementation for the component highlighter.
 */

import type { FrameworkConfig } from '../types'
import { transform, detectVue, VIRTUAL_MODULE_ID } from './transform'

/**
 * Vue framework configuration
 */
export const vueFramework: FrameworkConfig = {
  name: 'vue',
  displayName: 'Vue',
  extensions: ['.vue'],
  detect: detectVue,
  transform,
  runtimeModuleFile: 'frameworks/vue/runtime-module',
  virtualModuleId: VIRTUAL_MODULE_ID,
  storybookFramework: '@storybook/vue3-vite',
}

// Re-export for convenience
export { transform, detectVue, VIRTUAL_MODULE_ID } from './transform'
