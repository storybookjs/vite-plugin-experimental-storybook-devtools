/**
 * Vue-specific story generation
 */

import type { SerializedProps } from '../types'
import * as path from 'path'
import {
  type StoryGenerationData,
  type GeneratedStory,
  toValidStoryName,
  generateStoryName,
  getRelativeImportPath,
  hasAnyFunctionProps,
  collectComponentRefs,
  generateArgsContent,
  formatPlayFunctionForStory,
  extractStorybookTestImports,
  escapeRegex,
} from '../../utils/story-generator'

function splitVueSlotArgs(props: SerializedProps): {
  componentArgs: SerializedProps
  slotArgs: Record<string, unknown>
} {
  const componentArgs: SerializedProps = {}
  const slotArgs: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('slot:')) {
      slotArgs[key] = value
    } else {
      componentArgs[key] = value
    }
  }

  return { componentArgs, slotArgs }
}

function isSerializedVueSlot(
  value: unknown,
): value is { __isVueSlot: true; source: string; componentRefs: string[] } {
  if (!value || typeof value !== 'object') return false

  const slot = value as {
    __isVueSlot?: unknown
    source?: unknown
    componentRefs?: unknown
  }

  return (
    slot.__isVueSlot === true &&
    typeof slot.source === 'string' &&
    Array.isArray(slot.componentRefs)
  )
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function collectVueSlotComponentRefs(
  slotArgs: Record<string, unknown>,
  refs: Set<string>,
): void {
  for (const slotValue of Object.values(slotArgs)) {
    if (!isSerializedVueSlot(slotValue)) continue
    for (const ref of slotValue.componentRefs) {
      if (ref) refs.add(ref)
    }
  }
}

function buildVueSlotTemplate(slotArgs: Record<string, unknown>): string {
  const slotEntries = Object.entries(slotArgs)
    .map(([key, value]) => [key.slice('slot:'.length), value] as const)
    .filter(([slotName]) => Boolean(slotName))

  if (slotEntries.length === 0) {
    return ''
  }

  const defaultEntry = slotEntries.find(([slotName]) => slotName === 'default')
  const namedEntries = slotEntries
    .filter(([slotName]) => slotName !== 'default')
    .sort(([a], [b]) => a.localeCompare(b))

  const parts: string[] = []

  if (defaultEntry) {
    const slotValue = defaultEntry[1]
    if (isSerializedVueSlot(slotValue)) {
      parts.push(slotValue.source)
    } else if (typeof slotValue === 'string' && slotValue.trim()) {
      parts.push(escapeHtmlText(slotValue))
    }
  }

  for (const [slotName, slotValue] of namedEntries) {
    if (isSerializedVueSlot(slotValue)) {
      parts.push(`<template #${slotName}>${slotValue.source}</template>`)
    } else if (typeof slotValue === 'string' && slotValue.trim()) {
      parts.push(
        `<template #${slotName}>${escapeHtmlText(slotValue)}</template>`,
      )
    }
  }

  return parts.join('')
}

function buildVueRenderContent(
  componentName: string,
  slotArgs: Record<string, unknown>,
  slotComponentRefs: string[],
): string {
  const slotTemplate = buildVueSlotTemplate(slotArgs)
  if (!slotTemplate) {
    return ''
  }

  const allComponents = [componentName, ...slotComponentRefs].join(', ')

  return `
  render: (args) => ({
    components: { ${allComponents} },
    setup() {
      const componentArgs = Object.fromEntries(
        Object.entries(args).filter(([key]) => !key.startsWith('slot:')),
      );
      return { componentArgs };
    },
    template: \`<${componentName} v-bind="componentArgs">${slotTemplate}</${componentName}>\`,
  }),`
}

/**
 * Generate a Vue story file from component data
 * Vue-specific: imports include .vue extension, uses @storybook/vue3-vite
 */
export function generateStory(data: StoryGenerationData): GeneratedStory {
  const {
    meta,
    props,
    componentRegistry,
    storyName: customStoryName,
    existingContent,
    playFunction,
    playImports,
    storybookFramework,
  } = data
  const { componentName, filePath, isDefaultExport } = meta

  // Calculate paths
  const componentDir = path.dirname(filePath)
  const componentFileName = path.basename(filePath, path.extname(filePath))
  // Vue uses .stories.ts instead of .stories.tsx
  const storyFilePath = path.join(
    componentDir,
    `${componentFileName}.stories.ts`,
  )

  // Determine story name
  let storyName = customStoryName || generateStoryName(props)
  storyName = toValidStoryName(storyName)

  const { componentArgs, slotArgs } = splitVueSlotArgs(props)

  // Collect component references
  const componentRefs = new Set<string>()
  collectComponentRefs(componentArgs, componentRefs)
  collectVueSlotComponentRefs(slotArgs, componentRefs)

  // Build imports
  const imports: Array<{ name: string; path: string }> = []

  // Main component import - Vue requires .vue extension
  imports.push({
    name: isDefaultExport ? componentName : `{ ${componentName} }`,
    path: `./${componentFileName}.vue`,
  })

  // Referenced components - also need .vue extension
  if (componentRegistry) {
    for (const refName of componentRefs) {
      if (refName === componentName) continue

      const refFilePath = componentRegistry.get(refName)
      if (refFilePath) {
        const refRelativePath = getRelativeImportPath(componentDir, refFilePath)
        // Add .vue extension if not already there
        const refImportPath = refRelativePath.endsWith('.vue')
          ? refRelativePath
          : `${refRelativePath}.vue`
        imports.push({
          name: refName,
          path: refImportPath,
        })
      }
    }
  }

  // Generate content
  let content: string

  if (existingContent) {
    const appendOptions: Parameters<typeof appendStoryToExisting>[0] = {
      existingContent,
      storyName,
      props,
      imports,
      componentName,
    }
    if (componentRegistry) {
      appendOptions.componentRegistry = componentRegistry
    }
    if (playFunction) {
      appendOptions.playFunction = playFunction
    }
    if (playImports) {
      appendOptions.playImports = playImports
    }
    content = appendStoryToExisting(appendOptions)
  } else {
    const contentOptions: Parameters<typeof generateStoryContent>[0] = {
      componentName,
      imports,
      props,
      isDefaultExport,
      storyName,
    }
    if (componentRegistry) {
      contentOptions.componentRegistry = componentRegistry
    }
    if (playFunction) {
      contentOptions.playFunction = playFunction
    }
    if (playImports) {
      contentOptions.playImports = playImports
    }
    if (storybookFramework) {
      contentOptions.storybookFramework = storybookFramework
    }
    content = generateStoryContent(contentOptions)
  }

  return {
    content,
    filePath: storyFilePath,
    imports,
    storyName,
  }
}

/**
 * Generate new story file content
 */
function generateStoryContent(options: {
  componentName: string
  imports: Array<{ name: string; path: string }>
  props: SerializedProps
  isDefaultExport: boolean
  storyName: string
  componentRegistry?: Map<string, string>
  playFunction?: string[]
  playImports?: string[]
  storybookFramework?: string
}): string {
  const {
    componentName,
    imports,
    props,
    storyName,
    playFunction,
    playImports,
    storybookFramework = '@storybook/vue3-vite',
  } = options

  const { componentArgs, slotArgs } = splitVueSlotArgs(props)

  const needsFnImport = hasAnyFunctionProps(componentArgs)

  // Collect storybook/test imports
  const storybookTestNames = new Set<string>()
  if (needsFnImport) storybookTestNames.add('fn')
  if (playImports) {
    for (const playImport of playImports) {
      for (const name of extractStorybookTestImports(playImport)) {
        storybookTestNames.add(name)
      }
    }
  }

  const storybookTestImport =
    storybookTestNames.size > 0
      ? `import { ${[...storybookTestNames].join(', ')} } from 'storybook/test';`
      : null

  // Build imports
  const importStatements = [
    `import type { Meta, StoryObj } from '${storybookFramework}';`,
    ...(storybookTestImport ? [storybookTestImport] : []),
    ...imports.map((imp) => `import ${imp.name} from '${imp.path}';`),
  ].join('\n')

  const argsContent = generateArgsContent(
    componentArgs,
    1,
    options.componentRegistry,
  )
  const hasArgs = Object.keys(componentArgs).length > 0

  // Collect slot component refs for the render function
  const slotComponentRefs = new Set<string>()
  collectVueSlotComponentRefs(slotArgs, slotComponentRefs)

  const renderContent = buildVueRenderContent(
    componentName,
    slotArgs,
    [...slotComponentRefs].sort((a, b) => a.localeCompare(b)),
  )
  const hasPlay = playFunction && playFunction.length > 0
  const playContent = hasPlay
    ? `\n${formatPlayFunctionForStory(playFunction!)}`
    : ''

  return `${importStatements}

const meta: Meta<typeof ${componentName}> = {
  component: ${componentName},
};

export default meta;
type Story = StoryObj<typeof ${componentName}>;

export const ${storyName}: Story = {${renderContent}${hasArgs ? `\n  args: ${argsContent},` : ''}${playContent}
};
`
}

/**
 * Append a story to an existing file
 */
function appendStoryToExisting(options: {
  existingContent: string
  storyName: string
  props: SerializedProps
  imports: Array<{ name: string; path: string }>
  componentName: string
  componentRegistry?: Map<string, string>
  playFunction?: string[]
  playImports?: string[]
}): string {
  const {
    existingContent,
    storyName,
    props,
    imports,
    playFunction,
    playImports,
  } = options
  const { componentArgs, slotArgs } = splitVueSlotArgs(props)

  let finalStoryName = storyName
  const storyExportRegex = /export\s+const\s+(\w+)\s*[=:]/g
  const existingStories = new Set<string>()
  let match
  while ((match = storyExportRegex.exec(existingContent ?? '')) !== null) {
    if (match[1]) {
      existingStories.add(match[1])
    }
  }

  if (existingStories.has(finalStoryName)) {
    let counter = 2
    while (existingStories.has(`${storyName}${counter}`)) {
      counter++
    }
    finalStoryName = `${storyName}${counter}`
  }

  let updatedContent = existingContent

  // Handle fn import
  const needsFnImport = hasAnyFunctionProps(componentArgs)
  if (needsFnImport && !existingContent.includes("from 'storybook/test'")) {
    const lastImportMatch = updatedContent.match(
      /^(import\s+.+from\s+['"][^'"]+['"];?\s*\n)+/m,
    )
    if (lastImportMatch) {
      const insertPos = lastImportMatch.index! + lastImportMatch[0].length
      updatedContent =
        updatedContent.slice(0, insertPos) +
        `import { fn } from 'storybook/test';\n` +
        updatedContent.slice(insertPos)
    }
  } else if (
    needsFnImport &&
    existingContent.includes("from 'storybook/test'") &&
    !existingContent.includes('fn')
  ) {
    updatedContent = updatedContent.replace(
      /import\s*\{([^}]+)\}\s*from\s*['"]storybook\/test['"]/,
      (_match, existingImports) =>
        `import { ${existingImports.trim()}, fn } from 'storybook/test'`,
    )
  }

  // Handle component imports
  for (const imp of imports) {
    const importName = imp.name.replace(/[{}]/g, '').trim()
    if (
      !existingContent.includes(importName) ||
      !existingContent.includes(imp.path)
    ) {
      const samePathRegex = new RegExp(
        `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escapeRegex(imp.path)}['"]`,
      )
      const samePathMatch = updatedContent.match(samePathRegex)

      if (samePathMatch && samePathMatch[1] && imp.name.startsWith('{')) {
        const existingNames = samePathMatch[1]
        if (!existingNames.includes(importName)) {
          const newNames = `${existingNames.trim()}, ${importName}`
          updatedContent = updatedContent.replace(
            samePathMatch[0],
            `import { ${newNames} } from '${imp.path}'`,
          )
        }
      } else if (
        !samePathMatch &&
        !existingContent.includes(`from '${imp.path}'`)
      ) {
        const lastImportMatch = updatedContent.match(
          /^(import\s+.+from\s+['"][^'"]+['"];?\s*\n)+/m,
        )
        if (lastImportMatch) {
          const insertPos = lastImportMatch.index! + lastImportMatch[0].length
          const newImport = `import ${imp.name} from '${imp.path}';\n`
          updatedContent =
            updatedContent.slice(0, insertPos) +
            newImport +
            updatedContent.slice(insertPos)
        }
      }
    }
  }

  // Handle play imports
  if (playImports && playImports.length > 0) {
    for (const playImport of playImports) {
      const newNames = extractStorybookTestImports(playImport)
      if (newNames.length > 0) {
        const existingMatch = updatedContent.match(
          /import\s*\{([^}]+)\}\s*from\s*['"]storybook\/test['"]/,
        )
        if (existingMatch && existingMatch[1]) {
          const existingNames = existingMatch[1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          const mergedNames = [
            ...new Set([...existingNames, ...newNames]),
          ].join(', ')
          updatedContent = updatedContent.replace(
            existingMatch[0],
            `import { ${mergedNames} } from 'storybook/test'`,
          )
        } else {
          const lastImportMatch = updatedContent.match(
            /^(import\s+.+from\s+['"][^'"]+['"];?\s*\n)+/m,
          )
          if (lastImportMatch) {
            const insertPos = lastImportMatch.index! + lastImportMatch[0].length
            updatedContent =
              updatedContent.slice(0, insertPos) +
              `${playImport}\n` +
              updatedContent.slice(insertPos)
          }
        }
      }
    }
  }

  // Generate new story
  const argsContent = generateArgsContent(
    componentArgs,
    1,
    options.componentRegistry,
  )
  const hasArgs = Object.keys(componentArgs).length > 0

  // Collect slot component refs for the render function
  const slotComponentRefs = new Set<string>()
  collectVueSlotComponentRefs(slotArgs, slotComponentRefs)

  const renderContent = buildVueRenderContent(
    options.componentName,
    slotArgs,
    [...slotComponentRefs].sort((a, b) => a.localeCompare(b)),
  )
  const hasPlay = playFunction && playFunction.length > 0
  const playContent = hasPlay
    ? `\n${formatPlayFunctionForStory(playFunction!)}`
    : ''
  const newStory = `
export const ${finalStoryName}: Story = {${renderContent}${hasArgs ? `\n  args: ${argsContent},` : ''}${playContent}
};
`

  return updatedContent.trimEnd() + '\n' + newStory
}
