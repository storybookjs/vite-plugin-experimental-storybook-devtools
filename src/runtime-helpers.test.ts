import { describe, it, expect, vi } from 'vitest'
import {
  createLivePropEditor,
  getAtPath,
  setAtPath,
  type PropPath,
} from './runtime-helpers'

describe('setAtPath / getAtPath', () => {
  it('sets a top-level key immutably', () => {
    const obj = { a: 1, b: 2 }
    const next = setAtPath(obj, ['a'], 9)
    expect(next).toEqual({ a: 9, b: 2 })
    expect(obj).toEqual({ a: 1, b: 2 })
  })

  it('sets a nested path, cloning along the way', () => {
    const obj = { a: { b: { c: 1 }, keep: true } }
    const next = setAtPath(obj, ['a', 'b', 'c'], 2)
    expect(next).toEqual({ a: { b: { c: 2 }, keep: true } })
    expect(obj.a.b.c).toBe(1)
    expect(next['a']).not.toBe(obj.a)
  })

  it('preserves array identity semantics on array segments', () => {
    const obj = { list: [{ x: 1 }, { x: 2 }] }
    const next = setAtPath(obj, ['list', 1, 'x'], 9)
    expect(next).toEqual({ list: [{ x: 1 }, { x: 9 }] })
    expect(obj.list[1]!.x).toBe(2)
  })

  it('getAtPath reads nested values and tolerates missing segments', () => {
    const obj = { a: { b: [10, 20] } }
    expect(getAtPath(obj, ['a', 'b', 1])).toBe(20)
    expect(getAtPath(obj, ['a', 'missing', 'x'])).toBeUndefined()
    expect(getAtPath(null, ['a'])).toBeUndefined()
  })
})

type Registry = Map<
  string,
  { props: Record<string, unknown>; serializedProps: Record<string, unknown> }
>

function makeEditor(initialProps: Record<string, unknown>) {
  const registry: Registry = new Map([
    ['id-1', { props: initialProps, serializedProps: {} }],
  ])
  const applied: Array<{ id: string; path: PropPath; value: unknown }> = []
  const editor = createLivePropEditor({
    getInstance: (id) => registry.get(id),
    serializeValue: (v) => (typeof v === 'function' ? '[fn]' : v),
    applyOverride: (id, path, value) => {
      if (id === 'gone') throw new Error('Component instance not found')
      applied.push({ id, path, value })
    },
  })
  return { editor, registry, applied }
}

describe('createLivePropEditor', () => {
  it('decodes and applies each payload kind', () => {
    const { editor, applied } = makeEditor({
      s: 'a',
      n: 1,
      b: false,
      d: new Date(0),
      j: null,
    })

    expect(
      editor.setProp('id-1', ['s'], { kind: 'string', text: 'hello' }).ok,
    ).toBe(true)
    expect(
      editor.setProp('id-1', ['n'], { kind: 'number', text: '42' }).ok,
    ).toBe(true)
    expect(
      editor.setProp('id-1', ['b'], { kind: 'boolean', text: 'true' }).ok,
    ).toBe(true)
    expect(
      editor.setProp('id-1', ['d'], { kind: 'date', text: '2026-01-02' }).ok,
    ).toBe(true)
    expect(
      editor.setProp('id-1', ['j'], { kind: 'json', text: '{"x":[1,2]}' }).ok,
    ).toBe(true)

    expect(applied.map((a) => a.value)).toEqual([
      'hello',
      42,
      true,
      new Date('2026-01-02'),
      { x: [1, 2] },
    ])
  })

  it('rejects malformed payloads without touching the instance', () => {
    const { editor, applied } = makeEditor({ n: 1 })

    const notNumber = editor.setProp('id-1', ['n'], {
      kind: 'number',
      text: 'NaNaN',
    })
    expect(notNumber.ok).toBe(false)
    expect(notNumber.error).toContain('not a number')

    const badJson = editor.setProp('id-1', ['n'], {
      kind: 'json',
      text: '{oops',
    })
    expect(badJson.ok).toBe(false)
    expect(badJson.error).toContain('Invalid JSON')

    const fnMarker = editor.setProp('id-1', ['n'], {
      kind: 'json',
      text: '{"__isFunction":true,"name":"x"}',
    })
    expect(fnMarker.ok).toBe(false)
    expect(fnMarker.error).toContain('cannot be edited')

    expect(applied).toHaveLength(0)
  })

  it('revives {__isDate,iso} markers and decodes "undefined" json', () => {
    const { editor, applied } = makeEditor({ d: null, u: 1 })

    editor.setProp('id-1', ['d'], {
      kind: 'json',
      text: '{"__isDate":true,"iso":"2026-03-04T00:00:00.000Z"}',
    })
    expect(applied[0]?.value).toEqual(new Date('2026-03-04T00:00:00.000Z'))

    editor.setProp('id-1', ['u'], { kind: 'json', text: 'undefined' })
    expect(applied[1]?.value).toBeUndefined()
  })

  it('surfaces applyOverride failures as {ok:false}', () => {
    const { editor } = makeEditor({})
    const res = editor.setProp('gone', ['x'], { kind: 'string', text: 'v' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Component instance not found')
  })

  it('syncs registry props + serializedProps on edit', () => {
    const { editor, registry } = makeEditor({ title: 'orig', onClick: () => {} })

    editor.setProp('id-1', ['title'], { kind: 'string', text: 'edited' })

    const inst = registry.get('id-1')!
    expect(inst.props['title']).toBe('edited')
    expect(inst.serializedProps['title']).toBe('edited')
    expect(inst.serializedProps['onClick']).toBe('[fn]') // reserialized via serializeValue
  })

  it('tracks edited props and resets to the original value', () => {
    const { editor, registry, applied } = makeEditor({ title: 'orig' })

    expect(editor.getEditedProps('id-1')).toEqual([])

    editor.setProp('id-1', ['title'], { kind: 'string', text: 'changed' })
    expect(editor.getEditedProps('id-1')).toEqual(['title'])

    // Editing again keeps the FIRST original as the reset target.
    editor.setProp('id-1', ['title'], { kind: 'string', text: 'changed-2' })

    const reset = editor.resetProp('id-1', ['title'])
    expect(reset.ok).toBe(true)
    expect(applied.at(-1)?.value).toBe('orig')
    expect(registry.get('id-1')!.props['title']).toBe('orig')
    expect(editor.getEditedProps('id-1')).toEqual([])
  })

  it('reports an edit back to the original value as not-edited', () => {
    const { editor } = makeEditor({ title: 'orig' })
    editor.setProp('id-1', ['title'], { kind: 'string', text: 'changed' })
    editor.setProp('id-1', ['title'], { kind: 'string', text: 'orig' })
    expect(editor.getEditedProps('id-1')).toEqual([])
  })

  it('resetProp without a prior edit reports no original', () => {
    const { editor } = makeEditor({ title: 'orig' })
    const res = editor.resetProp('id-1', ['title'])
    expect(res.ok).toBe(false)
    expect(res.error).toBe('No original value to reset to')
  })

  it('supports nested-path edits (top-level key reported as edited)', () => {
    const { editor, registry } = makeEditor({
      task: { title: 'a', meta: { pri: 'low' } },
    })

    const res = editor.setProp('id-1', ['task', 'title'], {
      kind: 'string',
      text: 'b',
    })
    expect(res.ok).toBe(true)
    expect(registry.get('id-1')!.props['task']).toEqual({
      title: 'b',
      meta: { pri: 'low' },
    })
  })

  it('forgetInstance drops originals (unmount parity)', () => {
    const { editor } = makeEditor({ title: 'orig' })
    editor.setProp('id-1', ['title'], { kind: 'string', text: 'changed' })
    editor.forgetInstance('id-1')
    expect(editor.getEditedProps('id-1')).toEqual([])
    expect(editor.resetProp('id-1', ['title']).ok).toBe(false)
  })

  it('remembers originals per-instance without cross-talk', () => {
    const registry: Registry = new Map([
      ['a', { props: { t: '1' }, serializedProps: {} }],
      ['b', { props: { t: '2' }, serializedProps: {} }],
    ])
    const editor = createLivePropEditor({
      getInstance: (id) => registry.get(id),
      serializeValue: (v) => v,
      applyOverride: vi.fn(),
    })
    editor.setProp('a', ['t'], { kind: 'string', text: 'x' })
    expect(editor.getEditedProps('a')).toEqual(['t'])
    expect(editor.getEditedProps('b')).toEqual([])
  })
})
