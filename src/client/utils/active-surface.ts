/**
 * Which DevTools surface the user is currently driving from.
 *
 * More than one surface can be connected at once — the in-app embedded dock
 * and a browser-extension / standalone-viewer panel both talk to the same
 * server. Panel-open and story-navigation actions would otherwise fire on
 * every surface (popping the in-app dock even when the user is working in the
 * extension). A surface claims "driver" when it activates the highlighter;
 * the open/navigation handlers then route only to that surface.
 */
export type DevtoolsSurface = 'embedded' | 'standalone'

const ACTIVE_SURFACE_KEY = 'component-highlighter:active-surface'

// The real `DevframeRpcClient` carries its own shared-state generics that
// don't structurally match a hand-written interface, so accept it opaquely
// and narrow the one store we touch.
type SurfaceState = { value: DevtoolsSurface | null }

function surfaceStore(rpc: unknown): Promise<{
  value: () => SurfaceState | undefined
  mutate: (fn: (s: SurfaceState) => void) => unknown
}> | undefined {
  const sharedState = (rpc as { sharedState?: { get?: (k: string) => unknown } })
    ?.sharedState
  return sharedState?.get?.(ACTIVE_SURFACE_KEY) as never
}

/** Record which surface is now driving (the one that activated the highlighter). */
export async function setActiveSurface(
  rpc: unknown,
  surface: DevtoolsSurface,
): Promise<void> {
  try {
    const store = await surfaceStore(rpc)
    store?.mutate((s) => {
      s.value = surface
    })
  } catch {
    // not connected — best effort
  }
}

export async function getActiveSurface(
  rpc: unknown,
): Promise<DevtoolsSurface | null> {
  try {
    const store = await surfaceStore(rpc)
    return store?.value()?.value ?? null
  } catch {
    return null
  }
}

/**
 * Whether a surface of `clientType` should perform a panel open/switch for the
 * current driver. The standalone surface acts only when it is the driver; the
 * embedded surface acts otherwise — so with no driver recorded (`null`), the
 * in-app dock behaves exactly as it did before this routing existed.
 */
export function surfaceHandlesPanelActions(
  clientType: DevtoolsSurface,
  active: DevtoolsSurface | null,
): boolean {
  return (clientType === 'standalone') === (active === 'standalone')
}
