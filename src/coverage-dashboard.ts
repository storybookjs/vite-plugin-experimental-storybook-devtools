/**
 * Story Coverage Dashboard
 *
 * Creates a JSON-render dock panel showing component story coverage.
 * Uses the Vite DevTools json-render dock type for zero client code.
 *
 * This module is self-contained — it only depends on Node.js built-ins
 * and the DevTools Kit API shape, so it can be replaced or extended
 * without affecting other modules.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { JsonRenderSpec } from '@vitejs/devtools-kit'

export interface CoverageEntry {
  componentName: string
  filePath: string
  relativeFilePath: string
  hasStory: boolean
  storyPath: string | null
}

export interface CoverageData {
  entries: CoverageEntry[]
  totalComponents: number
  coveredComponents: number
  coveragePercent: number
}

const STORY_EXTENSIONS = ['.stories.tsx', '.stories.ts', '.stories.jsx', '.stories.js']

/**
 * Check if a component file has an associated story file.
 */
function findStoryFile(componentPath: string, storiesDir?: string): string | null {
  const dir = path.dirname(componentPath)
  const baseName = path.basename(componentPath, path.extname(componentPath))

  const searchDirs = [dir]
  if (storiesDir) {
    searchDirs.push(path.join(dir, storiesDir))
  }

  for (const searchDir of searchDirs) {
    for (const ext of STORY_EXTENSIONS) {
      const candidate = path.join(searchDir, baseName + ext)
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

/**
 * Compute coverage data from a set of known component file paths.
 */
export function computeCoverage(
  componentPaths: Map<string, string>,
  projectRoot: string,
  storiesDir?: string,
): CoverageData {
  const entries: CoverageEntry[] = []
  const seen = new Set<string>()

  for (const [name, filePath] of componentPaths) {
    if (seen.has(filePath)) continue
    seen.add(filePath)

    const storyPath = findStoryFile(filePath, storiesDir)
    entries.push({
      componentName: name,
      filePath,
      relativeFilePath: path.relative(projectRoot, filePath),
      hasStory: storyPath !== null,
      storyPath,
    })
  }

  // Sort: uncovered first, then alphabetical
  entries.sort((a, b) => {
    if (a.hasStory !== b.hasStory) return a.hasStory ? 1 : -1
    return a.componentName.localeCompare(b.componentName)
  })

  const totalComponents = entries.length
  const coveredComponents = entries.filter((e) => e.hasStory).length
  const coveragePercent = totalComponents > 0
    ? Math.round((coveredComponents / totalComponents) * 100)
    : 0

  return { entries, totalComponents, coveredComponents, coveragePercent }
}

/**
 * Build a JSON-render spec from coverage data.
 *
 * This produces a plain object matching the DevTools Kit JsonRenderSpec
 * shape. It has no runtime dependency on `@vitejs/devtools-kit` so
 * callers can use it freely.
 */
export function buildCoverageSpec(coverage: CoverageData): JsonRenderSpec {
  const rows = coverage.entries.map((entry) => ({
    Component: entry.componentName,
    File: entry.relativeFilePath,
    Status: entry.hasStory ? 'Covered' : 'Missing',
  }))

  return {
    root: 'root',
    elements: {
      root: {
        type: 'Stack',
        props: { direction: 'vertical', gap: 12 },
        children: ['header', 'progress', 'table'],
      },
      header: {
        type: 'Text',
        props: {
          variant: 'heading',
          text: `Story Coverage: ${coverage.coveragePercent}% (${coverage.coveredComponents}/${coverage.totalComponents})`,
        },
      },
      progress: {
        type: 'Progress',
        props: {
          value: coverage.coveragePercent,
          label: `${coverage.coveredComponents} of ${coverage.totalComponents} components have stories`,
        },
      },
      table: {
        type: 'DataTable',
        props: {
          columns: [
            { key: 'Component', label: 'Component' },
            { key: 'File', label: 'File' },
            { key: 'Status', label: 'Status' },
          ],
          rows,
          maxHeight: '400px',
        },
      },
    },
  }
}
