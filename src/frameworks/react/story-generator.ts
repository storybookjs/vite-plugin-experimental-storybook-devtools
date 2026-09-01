/**
 * React-specific story generation
 */

import type { SerializedProps } from '../types'
import * as path from 'path'
import {
  type StoryGenerationData,
  type GeneratedStory,
  toValidStoryName,
  generateStoryName,
  getRelativeImportPath,
  hasAnyJSXProps,
  hasAnyFunctionProps,
  collectComponentRefs,
  generateArgsContent,
  formatPlayFunctionForStory,
  extractStorybookTestImports,
  escapeRegex,
} from '../../utils/story-generator'

/**
 * Generate a React story file from component data
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
  const storyFilePath = path.join(
    componentDir,
    `${componentFileName}.stories.tsx`,
  )

  // Determine story name
  let storyName = customStoryName || generateStoryName(props)
  storyName = toValidStoryName(storyName)

  // Collect component references
  const componentRefs = new Set<string>()
  collectComponentRefs(props, componentRefs)

  // Build imports
  const imports: Array<{ name: string; path: string }> = []

  // Main component import (React: no .jsx/.tsx extension in import path)
  imports.push({
    name: isDefaultExport ? componentName : `{ ${componentName} }`,
    path: `./${componentFileName}`,
  })

  // Referenced components
  if (componentRegistry) {
    for (const refName of componentRefs) {
      if (refName === componentName) continue

      const refFilePath = componentRegistry.get(refName)
      if (refFilePath) {
        const refRelativePath = getRelativeImportPath(componentDir, refFilePath)
        imports.push({
          name: `{ ${refName} }`,
          path: refRelativePath,
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
    storybookFramework = '@storybook/react-vite',
  } = options

  const needsFnImport = hasAnyFunctionProps(props)
  const needsReactImport = hasAnyJSXProps(props)

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
    ...(needsReactImport ? [`import React from 'react';`] : []),
    `import type { Meta, StoryObj } from '${storybookFramework}';`,
    ...(storybookTestImport ? [storybookTestImport] : []),
    ...imports.map((imp) => `import ${imp.name} from '${imp.path}';`),
  ].join('\n')

  const argsContent = generateArgsContent(props, 1, options.componentRegistry)
  const hasArgs = Object.keys(props).length > 0
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

export const ${storyName}: Story = {${hasArgs ? `\n  args: ${argsContent},` : ''}${playContent}
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
  const needsFnImport = hasAnyFunctionProps(props)
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
  const argsContent = generateArgsContent(props, 1, options.componentRegistry)
  const hasArgs = Object.keys(props).length > 0
  const hasPlay = playFunction && playFunction.length > 0
  const playContent = hasPlay
    ? `\n${formatPlayFunctionForStory(playFunction!)}`
    : ''
  const newStory = `
export const ${finalStoryName}: Story = {${hasArgs ? `\n  args: ${argsContent},` : ''}${playContent}
};
`

  return updatedContent.trimEnd() + '\n' + newStory
}
