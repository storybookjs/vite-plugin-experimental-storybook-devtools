import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStoryIndexService } from './story-index'
import { computeCoverage } from './coverage-dashboard'

const reactPlayground = path.resolve(__dirname, '../playground/react')

describe('createStoryIndexService', () => {
  const writtenFiles: string[] = []
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const file of writtenFiles.splice(0)) {
      fs.rmSync(file, { force: true })
    }
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeTmpProject(): string {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ch-story-index-')),
    )
    tmpDirs.push(dir)
    return dir
  }

  it('builds an index with the known react playground story entries', async () => {
    const service = createStoryIndexService({
      cwd: reactPlayground,
      logDebug: () => {},
    })

    const index = await service.getIndex()

    const ids = Object.keys(index.entries)
    expect(ids).toContain('components-badge--inprogress')
    expect(ids).toContain('components-button--qaeditedprops')
    expect(ids).toContain('components-input--empty')
  })

  it('reflects a newly added story file after invalidate()', async () => {
    const service = createStoryIndexService({
      cwd: reactPlayground,
      logDebug: () => {},
    })

    const before = await service.getIndex()
    expect(
      Object.keys(before.entries).some((id) =>
        id.startsWith('components-storyindextestwidget'),
      ),
    ).toBe(false)

    const newStoryPath = path.join(
      reactPlayground,
      'src/components/StoryIndexTestWidget.stories.tsx',
    )
    writtenFiles.push(newStoryPath)
    fs.writeFileSync(
      newStoryPath,
      `import type { Meta, StoryObj } from '@storybook/react-vite'

const StoryIndexTestWidget = () => null

const meta: Meta<typeof StoryIndexTestWidget> = {
  title: 'Components/StoryIndexTestWidget',
  component: StoryIndexTestWidget,
}
export default meta
type Story = StoryObj<typeof StoryIndexTestWidget>

export const Default: Story = {}
`,
    )

    service.invalidate(newStoryPath)
    const after = await service.getIndex()

    expect(Object.keys(after.entries)).toContain(
      'components-storyindextestwidget--default',
    )
  })

  describe('file-scan fallback (no Storybook project)', () => {
    it('synthesises an entry for a story file sitting next to its component', async () => {
      const projectRoot = makeTmpProject()
      const componentPath = path.join(projectRoot, 'src/Button.tsx')
      fs.mkdirSync(path.dirname(componentPath), { recursive: true })
      fs.writeFileSync(componentPath, '')
      fs.writeFileSync(path.join(projectRoot, 'src/Button.stories.tsx'), '')

      const service = createStoryIndexService({
        cwd: projectRoot,
        logDebug: () => {},
      })
      const index = await service.getIndex()
      const entry = Object.values(index.entries)[0]

      // No synthesised `componentPath`: `findStoryCandidates` matches these
      // on `importPath`, and a `componentPath` would decide membership
      // outright.
      expect(entry).toEqual({
        id: expect.any(String),
        type: 'story',
        importPath: './src/Button.stories.tsx',
      })

      const coverage = computeCoverage(
        new Map([['Button', componentPath]]),
        projectRoot,
        index.entries,
      )
      expect(coverage.entries[0]?.hasStory).toBe(true)
    })

    it('finds a story in a stories directory next to the component', async () => {
      const projectRoot = makeTmpProject()
      const componentPath = path.join(projectRoot, 'src/Card.tsx')
      fs.mkdirSync(path.join(projectRoot, 'src/stories'), { recursive: true })
      fs.writeFileSync(componentPath, '')
      fs.writeFileSync(
        path.join(projectRoot, 'src/stories/Card.stories.ts'),
        '',
      )

      const service = createStoryIndexService({
        cwd: projectRoot,
        logDebug: () => {},
      })
      const coverage = computeCoverage(
        new Map([['Card', componentPath]]),
        projectRoot,
        (await service.getIndex()).entries,
      )

      expect(coverage.entries[0]?.hasStory).toBe(true)
    })

    it('leaves a component without a story file uncovered', async () => {
      const projectRoot = makeTmpProject()
      const componentPath = path.join(projectRoot, 'Orphan.tsx')
      fs.writeFileSync(componentPath, '')

      const service = createStoryIndexService({
        cwd: projectRoot,
        logDebug: () => {},
      })
      const index = await service.getIndex()

      expect(index.entries).toEqual({})

      const coverage = computeCoverage(
        new Map([['Orphan', componentPath]]),
        projectRoot,
        index.entries,
      )
      expect(coverage.entries[0]?.hasStory).toBe(false)
    })

    it('memoises a failed generator build until invalidate()', async () => {
      const projectRoot = makeTmpProject()
      fs.writeFileSync(
        path.join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'tmp-test', version: '1.0.0' }),
      )
      fs.mkdirSync(path.join(projectRoot, '.storybook'))
      // A stories entry `normalizeStories` rejects: the project resolves,
      // building the generator throws.
      fs.writeFileSync(
        path.join(projectRoot, '.storybook', 'main.ts'),
        `export default { stories: [123], framework: '@storybook/react-vite' }`,
      )

      const logDebug = vi.fn()
      const buildAttempts = () =>
        logDebug.mock.calls.filter((call) =>
          String(call[0]).includes('Failed to build'),
        ).length

      const service = createStoryIndexService({ cwd: projectRoot, logDebug })

      await service.getIndex()
      await service.getIndex()
      expect(buildAttempts()).toBe(1)

      service.invalidate()
      await service.getIndex()
      expect(buildAttempts()).toBe(2)
    })

    it('picks up a story file written after the first getIndex()', async () => {
      const projectRoot = makeTmpProject()
      fs.writeFileSync(path.join(projectRoot, 'Late.tsx'), '')

      const service = createStoryIndexService({
        cwd: projectRoot,
        logDebug: () => {},
      })
      expect(Object.keys((await service.getIndex()).entries)).toHaveLength(0)

      const storyPath = path.join(projectRoot, 'Late.stories.tsx')
      fs.writeFileSync(storyPath, '')
      service.invalidate(storyPath)

      expect(Object.keys((await service.getIndex()).entries)).toHaveLength(1)
    })
  })
})
