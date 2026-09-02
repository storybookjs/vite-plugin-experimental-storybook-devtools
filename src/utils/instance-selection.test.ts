import { describe, expect, it } from 'vitest'
import {
  ordinal,
  pickRepresentativeByKey,
  propsFingerprint,
} from './instance-selection'

describe('propsFingerprint', () => {
  it('ignores function and JSX markers', () => {
    const fp = propsFingerprint({
      onClick: { __isFunction: true },
      children: { __isJSX: true, source: '<span/>' },
      label: 'Save',
    })
    expect(fp).toBe(JSON.stringify({ label: 'Save' }))
  })

  it('is stable regardless of key order', () => {
    const a = propsFingerprint({ variant: 'primary', size: 'sm' })
    const b = propsFingerprint({ size: 'sm', variant: 'primary' })
    expect(a).toBe(b)
  })
})

describe('pickRepresentativeByKey', () => {
  interface Instance {
    id: string
    serializedProps?: Record<string, unknown>
    editedProps?: string[]
  }

  const keyFn = (i: Instance) =>
    i.serializedProps ? propsFingerprint(i.serializedProps) : '{}'

  it('keeps the first instance of each unique key when none carry edits', () => {
    const a: Instance = { id: 'a', serializedProps: { label: 'View' } }
    const b: Instance = { id: 'b', serializedProps: { label: 'View' } }
    const c: Instance = { id: 'c', serializedProps: { label: 'Other' } }
    expect(pickRepresentativeByKey([a, b, c], keyFn)).toEqual([a, c])
  })

  it('prefers an edited instance over an unedited one sharing the same key', () => {
    // Two sibling Buttons started with identical props; the third card's
    // edit (e.g. a JSX children override the fingerprint ignores) still
    // collides on key with the first two — the edited instance must win.
    const unedited1: Instance = { id: 'card1', serializedProps: { label: 'View' } }
    const unedited2: Instance = { id: 'card2', serializedProps: { label: 'View' } }
    const edited: Instance = {
      id: 'card3',
      serializedProps: { label: 'View' },
      editedProps: ['children'],
    }
    const result = pickRepresentativeByKey(
      [unedited1, unedited2, edited],
      keyFn,
    )
    expect(result).toEqual([edited])
  })

  it('keeps the first edited instance when multiple collide', () => {
    const firstEdited: Instance = {
      id: 'first',
      serializedProps: { label: 'View' },
      editedProps: ['label'],
    }
    const secondEdited: Instance = {
      id: 'second',
      serializedProps: { label: 'View' },
      editedProps: ['variant'],
    }
    const result = pickRepresentativeByKey(
      [firstEdited, secondEdited],
      keyFn,
    )
    expect(result).toEqual([firstEdited])
  })

  it('does not let an unedited instance replace an already-picked edited one', () => {
    const edited: Instance = {
      id: 'edited',
      serializedProps: { label: 'View' },
      editedProps: ['label'],
    }
    const unedited: Instance = { id: 'unedited', serializedProps: { label: 'View' } }
    const result = pickRepresentativeByKey([edited, unedited], keyFn)
    expect(result).toEqual([edited])
  })
})

describe('ordinal', () => {
  it('formats common cases', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
  })

  it('formats the 11th-13th special cases', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
  })

  it('formats larger numbers', () => {
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
    expect(ordinal(101)).toBe('101st')
    expect(ordinal(111)).toBe('111th')
  })
})
