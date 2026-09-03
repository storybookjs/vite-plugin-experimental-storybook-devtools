import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveStorybookProject,
  resolveProjectRootSync,
} from './storybook-project'

describe('resolveStorybookProject', () => {
  const tmpDirs: string[] = []

  function makeTmpProject(mainConfigSource: string): string {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ch-sb-project-')),
    )
    tmpDirs.push(dir)
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'tmp-test', version: '1.0.0' }),
    )
    fs.mkdirSync(path.join(dir, '.storybook'))
    fs.writeFileSync(path.join(dir, '.storybook', 'main.ts'), mainConfigSource)
    return dir
  }

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves a string framework field (Next.js, nextjs-vite)', async () => {
    const dir = makeTmpProject(
      `export default { stories: [], framework: '@storybook/nextjs-vite' }`,
    )

    const project = await resolveStorybookProject(dir)

    expect(project?.frameworkPackage).toBe('@storybook/nextjs-vite')
    expect(project?.configDir).toBe(path.join(dir, '.storybook'))
    expect(project?.mainConfigPath).toContain('main.ts')
  })

  it('resolves an object framework field (webpack5)', async () => {
    const dir = makeTmpProject(
      `export default { stories: [], framework: { name: '@storybook/react-webpack5', options: {} } }`,
    )

    const project = await resolveStorybookProject(dir)

    expect(project?.frameworkPackage).toBe('@storybook/react-webpack5')
    expect(project?.renderer).toBe('react')
    expect(project?.builder).toBe('webpack5')
  })

  it('carries through the raw stories globs and addons', async () => {
    const dir = makeTmpProject(
      `export default { stories: ['../src/**/*.stories.tsx'], addons: ['@storybook/addon-a11y'], framework: '@storybook/react-vite' }`,
    )

    const project = await resolveStorybookProject(dir)

    expect(project?.storiesGlobs).toEqual(['../src/**/*.stories.tsx'])
    expect(project?.addons).toEqual(['@storybook/addon-a11y'])
  })

  it('returns null when no .storybook config exists', async () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ch-sb-project-')),
    )
    tmpDirs.push(dir)
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'tmp-test', version: '1.0.0' }),
    )

    const project = await resolveStorybookProject(dir)

    expect(project).toBeNull()
  })

  it('memoises per cwd (second call does not re-read the config)', async () => {
    const dir = makeTmpProject(
      `export default { stories: [], framework: '@storybook/react-vite' }`,
    )

    const first = await resolveStorybookProject(dir)
    // Mutate the config on disk — a memoised second call must not see this.
    fs.writeFileSync(
      path.join(dir, '.storybook', 'main.ts'),
      `export default { stories: [], framework: '@storybook/vue3-vite' }`,
    )
    const second = await resolveStorybookProject(dir)

    expect(second?.frameworkPackage).toBe(first?.frameworkPackage)
  })

  it('resolves the real react playground config', async () => {
    const reactPlayground = path.resolve(__dirname, '../playground/react')
    const project = await resolveStorybookProject(reactPlayground)

    expect(project?.frameworkPackage).toBe('@storybook/react-vite')
    expect(project?.renderer).toBe('react')
  })

  it('resolves the real vue playground config', async () => {
    const vuePlayground = path.resolve(__dirname, '../playground/vue')
    const project = await resolveStorybookProject(vuePlayground)

    expect(project?.frameworkPackage).toBe('@storybook/vue3-vite')
    expect(project?.renderer).toBe('vue3')
  })
})

describe('resolveProjectRootSync', () => {
  it('resolves the repo root (against the real process cwd)', () => {
    expect(resolveProjectRootSync()).toBe(path.resolve(__dirname, '..'))
  })
})
