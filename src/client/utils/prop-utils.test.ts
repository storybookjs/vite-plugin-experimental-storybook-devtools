import { describe, it, expect } from 'vitest'
import { propEditability, editInitialText, classifyProp } from './prop-utils'

describe('propEditability', () => {
  it('marks primitives editable with the right kind', () => {
    expect(propEditability('hi')).toEqual({ editable: true, kind: 'string' })
    expect(propEditability(42)).toEqual({ editable: true, kind: 'number' })
    expect(propEditability(true)).toEqual({ editable: true, kind: 'boolean' })
  })

  it('treats null/undefined as editable JSON', () => {
    expect(propEditability(null)).toEqual({ editable: true, kind: 'json' })
    expect(propEditability(undefined)).toEqual({ editable: true, kind: 'json' })
  })

  it('serialized Date markers are editable as date', () => {
    expect(
      propEditability({ __isDate: true, iso: '2026-01-01T00:00:00.000Z' }),
    ).toEqual({ editable: true, kind: 'date' })
  })

  it('functions / JSX / slots are read-only', () => {
    expect(propEditability({ __isFunction: true, name: 'fn' }).editable).toBe(
      false,
    )
    expect(propEditability({ __isJSX: true, source: '<X/>' }).editable).toBe(
      false,
    )
    expect(
      propEditability({ __isVueSlot: true, source: '' }).editable,
    ).toBe(false)
    expect(propEditability(() => {}).editable).toBe(false)
  })

  it('pure objects/arrays are editable JSON', () => {
    expect(propEditability({ a: 1, b: 'x' })).toEqual({
      editable: true,
      kind: 'json',
    })
    expect(propEditability([1, 2, 3])).toEqual({
      editable: true,
      kind: 'json',
    })
    // nested Date marker is reconstructable → still editable
    expect(
      propEditability({ when: { __isDate: true, iso: '2020-01-01' } }).editable,
    ).toBe(true)
  })

  it('objects/arrays containing a function/JSX are NOT editable', () => {
    expect(
      propEditability({ onClick: { __isFunction: true, name: 'h' } }).editable,
    ).toBe(false)
    expect(
      propEditability([{ __isJSX: true, source: '<A/>' }]).editable,
    ).toBe(false)
  })

  it('non-plain object markers (Map/Set/class) are read-only', () => {
    expect(propEditability({ __isObject: true, name: 'Map' }).editable).toBe(
      false,
    )
    // nested inside a plain object: still not reconstructable → read-only
    expect(
      propEditability({ cache: { __isObject: true, name: 'Set' } }).editable,
    ).toBe(false)
  })
})

describe('classifyProp', () => {
  it('renders the non-plain object marker by its constructor name', () => {
    expect(classifyProp('lookup', { __isObject: true, name: 'Map' })).toEqual({
      typeClass: 'obj',
      display: 'Map',
      viewable: false,
      raw: null,
    })
  })

  it('falls back to "Object" when the marker has no name', () => {
    expect(classifyProp('x', { __isObject: true }).display).toBe('Object')
  })
})

describe('editInitialText', () => {
  it('seeds the editor field per kind', () => {
    expect(editInitialText('hello', 'string')).toBe('hello')
    expect(editInitialText(7, 'number')).toBe('7')
    expect(editInitialText(true, 'boolean')).toBe('true')
    expect(editInitialText(false, 'boolean')).toBe('false')
    expect(
      editInitialText({ __isDate: true, iso: '2026-05-18T00:00:00.000Z' }, 'date'),
    ).toBe('2026-05-18T00:00:00.000Z')
    expect(editInitialText({ a: 1 }, 'json')).toBe('{\n  "a": 1\n}')
    expect(editInitialText(undefined, 'json')).toBe('null')
  })
})
