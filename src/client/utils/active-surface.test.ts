import { describe, expect, it } from 'vitest'
import { surfaceHandlesPanelActions } from './active-surface'

describe('surfaceHandlesPanelActions', () => {
  it('routes to the standalone surface when it is the driver', () => {
    expect(surfaceHandlesPanelActions('standalone', 'standalone')).toBe(true)
    expect(surfaceHandlesPanelActions('embedded', 'standalone')).toBe(false)
  })

  it('routes to the embedded surface when it is the driver', () => {
    expect(surfaceHandlesPanelActions('embedded', 'embedded')).toBe(true)
    expect(surfaceHandlesPanelActions('standalone', 'embedded')).toBe(false)
  })

  it('defaults to the embedded surface when no driver is recorded', () => {
    // Preserves the pre-routing behavior: the in-app dock handles it, the
    // standalone surface stays out of the way.
    expect(surfaceHandlesPanelActions('embedded', null)).toBe(true)
    expect(surfaceHandlesPanelActions('standalone', null)).toBe(false)
  })
})
