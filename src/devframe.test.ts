import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRepositoryRoot } from './devframe'

describe('findRepositoryRoot', () => {
  const tmpDirs: string[] = []

  function makeTmpTree(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-repo-root-'))
    tmpDirs.push(dir)
    return fs.realpathSync(dir)
  }

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds the nearest ancestor with a .git directory', () => {
    const root = makeTmpTree()
    fs.mkdirSync(path.join(root, '.git'))
    const nested = path.join(root, 'playground', 'rsbuild')
    fs.mkdirSync(nested, { recursive: true })

    expect(findRepositoryRoot(nested)).toBe(root)
  })

  it('finds a pnpm workspace root without .git', () => {
    const root = makeTmpTree()
    fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    const nested = path.join(root, 'apps', 'web')
    fs.mkdirSync(nested, { recursive: true })

    expect(findRepositoryRoot(nested)).toBe(root)
  })

  it('returns the start directory itself when it is the root', () => {
    const root = makeTmpTree()
    fs.mkdirSync(path.join(root, '.git'))

    expect(findRepositoryRoot(root)).toBe(root)
  })

  it('finds a lockfile root without .git (yarn monorepo, exported checkout)', () => {
    const root = makeTmpTree()
    fs.writeFileSync(path.join(root, 'yarn.lock'), '')
    const nested = path.join(root, 'apps', 'web')
    fs.mkdirSync(nested, { recursive: true })

    expect(findRepositoryRoot(nested)).toBe(root)
  })

  it('prefers a VCS root over a closer nested lockfile', () => {
    const root = makeTmpTree()
    fs.mkdirSync(path.join(root, '.git'))
    const nested = path.join(root, 'packages', 'app')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'package-lock.json'), '{}')

    expect(findRepositoryRoot(nested)).toBe(root)
  })

  it('honors the STORYBOOK_PROJECT_ROOT override', () => {
    const root = makeTmpTree()
    const nested = path.join(root, 'a')
    fs.mkdirSync(nested)
    process.env['STORYBOOK_PROJECT_ROOT'] = root
    try {
      expect(findRepositoryRoot(nested)).toBe(root)
    } finally {
      delete process.env['STORYBOOK_PROJECT_ROOT']
    }
  })

  it('returns undefined when no marker exists up the tree', () => {
    const root = makeTmpTree()
    const nested = path.join(root, 'a', 'b')
    fs.mkdirSync(nested, { recursive: true })

    expect(findRepositoryRoot(nested)).toBeUndefined()
  })
})
