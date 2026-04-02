/**
 * Merged Storybook + Coverage panel.
 *
 * Hosted as a standalone HTML app via `ctx.views.hostStatic`.
 * Communicates with the server plugin via RPC and fetch-based middleware endpoints.
 * All client-side DOM operations are delegated to the client via RPC broadcast
 * so that the panel works whether inline or popped out into a separate window.
 */

import {
  getDevToolsRpcClient,
  type DevToolsRpcClient,
} from '@vitejs/devtools-kit/client'

// ─── RPC client ─────────────────────────────────────────────────────

let rpcClient: DevToolsRpcClient | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let registrySharedState: any = null

async function initRpcClient() {
  try {
    const client = await getDevToolsRpcClient()
    await client.ensureTrusted()
    rpcClient = client

    // Subscribe to shared state
    const regState = await client.sharedState.get(
      'component-highlighter:registry',
    )
    registrySharedState = regState
    // Refresh coverage immediately when the registry changes (e.g. on navigation)
    regState.on('updated', () => {
      if (coverageInterval) {
        // Coverage tab is active — refresh immediately
        refreshCoverage()
      }
    })

    const visitState = await client.sharedState.get(
      'component-highlighter:pending-visit',
    )
    // React to pending visit changes in real time
    const currentVisit = visitState.value()
    if (currentVisit) {
      visitState.mutate(() => null) // consume
      visitStory(currentVisit.relativeFilePath, currentVisit.preferredStoryName)
    }
    visitState.on('updated', (val: any) => {
      if (val) {
        visitState.mutate(() => null) // consume
        visitStory(val.relativeFilePath, val.preferredStoryName)
      }
    })

    const tabState = await client.sharedState.get(
      'component-highlighter:pending-tab',
    )
    const currentTab = tabState.value()
    if (currentTab) {
      tabState.mutate(() => null) // consume
      switchTab(currentTab as TabId)
    }
    tabState.on('updated', (val: any) => {
      if (val) {
        tabState.mutate(() => null) // consume
        switchTab(val as TabId)
      }
    })

    // Sync highlight toggle button state
    const hlState = await client.sharedState.get(
      'component-highlighter:highlight-active',
    )
    const updateHighlightBtn = (active: boolean) => {
      highlightEnabled = active
      const btn = document.getElementById('highlight-toggle')
      btn?.classList.toggle('active', active)
    }
    updateHighlightBtn(hlState.value() ?? false)
    hlState.on('updated', (val: any) => updateHighlightBtn(!!val))
  } catch {
    // RPC client not available (e.g. during build or test)
  }
}

/** Convenience wrapper for server RPC calls */
function rpcCall(method: string, ...args: unknown[]): Promise<unknown> {
  if (!rpcClient) return Promise.resolve(undefined)
  return (rpcClient.call as any)(method, ...args)
}

/** Registry instance shape matching the server's SerializedRegistryInstance */
interface RegistryInstance {
  id: string
  meta: {
    componentName: string
    filePath: string
    relativeFilePath?: string
    sourceId: string
    isDefaultExport?: boolean
  }
  props: Record<string, unknown>
  serializedProps?: Record<string, unknown>
  isConnected: boolean
}

// ─── Icons ──────────────────────────────────────────────────────────
const CODE_ICON = `<svg width="12" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.53613 4.31055C7.63877 4.05443 7.92931 3.92987 8.18555 4.03223C8.44167 4.13483 8.56617 4.4254 8.46387 4.68164L6.46387 9.68164C6.36117 9.93761 6.07062 10.0623 5.81445 9.95996C5.55837 9.85739 5.43397 9.56674 5.53613 9.31055L7.53613 4.31055Z" fill="currentColor"/><path d="M3.64648 5.14258C3.84175 4.94762 4.15834 4.94747 4.35352 5.14258C4.5486 5.33775 4.54846 5.65435 4.35352 5.84961L3.20703 6.99609L4.35352 8.14258C4.5486 8.33775 4.54846 8.65435 4.35352 8.84961C4.15826 9.04458 3.84166 9.0447 3.64648 8.84961L2.14648 7.34961C2.04896 7.25205 2.00006 7.12393 2 6.99609C2.00001 6.93207 2.01266 6.86784 2.03711 6.80762C2.04931 6.77763 2.06475 6.74834 2.08301 6.7207L2.14648 6.64258L3.64648 5.14258Z" fill="currentColor"/><path d="M9.64648 5.14258C9.84174 4.94763 10.1583 4.9475 10.3535 5.14258L11.8535 6.64258L11.918 6.7207C11.9363 6.7484 11.9517 6.77755 11.9639 6.80762C11.9883 6.86782 12 6.93209 12 6.99609C11.9999 7.12383 11.9509 7.25208 11.8535 7.34961L10.3535 8.84961C10.1583 9.04455 9.84166 9.0447 9.64648 8.84961C9.45144 8.65443 9.45155 8.33782 9.64648 8.14258L10.793 6.99609L9.64648 5.84961C9.45142 5.65445 9.45158 5.33784 9.64648 5.14258Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M13.5 0C13.7761 0 14 0.223858 14 0.5V11.5L13.9902 11.6006C13.9503 11.7961 13.7961 11.9503 13.6006 11.9902L13.5 12H0.5L0.399414 11.9902C0.203918 11.9503 0.0496648 11.7961 0.00976562 11.6006L0 11.5V0.5C1.28852e-07 0.223858 0.223858 1.20798e-08 0.5 0H13.5ZM1 11H13V3H1V11ZM1.5 1C1.22386 1 1 1.22386 1 1.5C1 1.77614 1.22386 2 1.5 2C1.77614 2 2 1.77614 2 1.5C2 1.22386 1.77614 1 1.5 1ZM3.5 1C3.22386 1 3 1.22386 3 1.5C3 1.77614 3.22386 2 3.5 2C3.77614 2 4 1.77614 4 1.5C4 1.22386 3.77614 1 3.5 1ZM5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2C5.77614 2 6 1.77614 6 1.5C6 1.22386 5.77614 1 5.5 1Z" fill="currentColor"/></svg>`
const SB_ICON_SMALL = `<svg width="12" height="12" viewBox="-31.5 0 319 319" xmlns="http://www.w3.org/2000/svg"><path fill="#FF4785" d="M9.87,293.32L0.01,30.57C-0.31,21.9,6.34,14.54,15.01,14L238.49,0.03C247.32,-0.52,254.91,6.18,255.47,15.01C255.49,15.34,255.5,15.67,255.5,16V302.32C255.5,311.16,248.33,318.32,239.49,318.32C239.25,318.32,239.01,318.32,238.77,318.31L25.15,308.71C16.83,308.34,10.18,301.65,9.87,293.32Z"/><path fill="#FFF" d="M188.67,39.13L190.19,2.41L220.88,0L222.21,37.86C222.25,39.18,221.22,40.29,219.9,40.33C219.34,40.35,218.79,40.17,218.34,39.82L206.51,30.5L192.49,41.13C191.44,41.93,189.95,41.72,189.15,40.67C188.81,40.23,188.64,39.68,188.67,39.13ZM149.41,119.98C149.41,126.21,191.36,123.22,196.99,118.85C196.99,76.45,174.23,54.17,132.57,54.17C90.91,54.17,67.57,76.79,67.57,110.74C67.57,169.85,147.35,170.98,147.35,203.23C147.35,212.28,142.91,217.65,133.16,217.65C120.46,217.65,115.43,211.17,116.02,189.1C116.02,184.32,67.57,182.82,66.09,189.1C62.33,242.57,95.64,257.99,133.75,257.99C170.69,257.99,199.65,238.3,199.65,202.66C199.65,139.3,118.68,141,118.68,109.6C118.68,96.88,128.14,95.18,133.75,95.18C139.66,95.18,150.3,96.22,149.41,119.98Z"/></svg>`
const SB_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="m16.71.243l-.12 2.71a.18.18 0 0 0 .29.15l1.06-.8l.9.7a.18.18 0 0 0 .28-.14l-.1-2.76l1.33-.1a1.2 1.2 0 0 1 1.279 1.2v21.596a1.2 1.2 0 0 1-1.26 1.2l-16.096-.72a1.2 1.2 0 0 1-1.15-1.16l-.75-19.797a1.2 1.2 0 0 1 1.13-1.27L16.7.222zM13.64 9.3c0 .47 3.16.24 3.59-.08c0-3.2-1.72-4.89-4.859-4.89c-3.15 0-4.899 1.72-4.899 4.29c0 4.45 5.999 4.53 5.999 6.959c0 .7-.32 1.1-1.05 1.1c-.96 0-1.35-.49-1.3-2.16c0-.36-3.649-.48-3.769 0c-.27 4.03 2.23 5.2 5.099 5.2c2.79 0 4.969-1.49 4.969-4.18c0-4.77-6.099-4.64-6.099-6.999c0-.97.72-1.1 1.13-1.1c.45 0 1.25.07 1.19 1.87z"/></svg>`
const COVERAGE_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.76464 1.0757C9.90598 1.16404 10 1.32104 10 1.5V7.5L9.99992 7.50892C9.9987 7.57865 9.98321 7.64491 9.95623 7.70488C9.92676 7.77041 9.88358 7.82845 9.83035 7.87534L5.3369 11.8695C5.30013 11.9031 5.25937 11.9303 5.21616 11.951C5.14779 11.9838 5.0738 12 5 12C4.9262 12 4.85221 11.9838 4.78384 11.951C4.74062 11.9303 4.69986 11.9031 4.66308 11.8695L0.169665 7.87535L0.161201 7.86772C0.109893 7.82048 0.0706711 7.76488 0.0437672 7.70488C0.0169921 7.64535 0.0015266 7.57963 0.000107183 7.51046L0 7.5V1.5C0 1.32103 0.0940346 1.16401 0.235393 1.07568L0.252579 1.06477C0.268532 1.0548 0.290464 1.04142 0.318377 1.02514C0.374201 0.992577 0.453956 0.94838 0.557643 0.896536C0.765036 0.79284 1.06813 0.658576 1.46689 0.525658C2.2651 0.259589 3.44341 0 5 0C6.55659 0 7.7349 0.259589 8.53311 0.525658C8.93187 0.658576 9.23496 0.79284 9.44236 0.896536C9.54604 0.94838 9.6258 0.992577 9.68162 1.02514C9.70954 1.04142 9.73147 1.0548 9.74742 1.06477L9.76464 1.0757ZM1 1.7934V7.27547L2.06804 8.22483L8.65573 1.63719C8.53022 1.58541 8.38394 1.53003 8.21689 1.47434C7.5151 1.24041 6.44341 1 5 1C3.55659 1 2.4849 1.24041 1.78311 1.47434C1.43187 1.59142 1.17246 1.70716 1.00486 1.79096L1 1.7934ZM5 10.831L2.81674 8.89035L9 2.70713V7.27547L5 10.831Z" fill="currentColor"/></svg>`
const TERMINAL_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`
const CROSSHAIR_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 3.00391C0.447715 3.00391 0 3.45162 0 4.00391V9.00391C0 9.55619 0.447715 10.0039 1 10.0039H4.5C4.77614 10.0039 5 9.78005 5 9.50391C5 9.22776 4.77614 9.00391 4.5 9.00391H1V4.00391L13 4.00391V9.00391H12C11.7239 9.00391 11.5 9.22776 11.5 9.50391C11.5 9.78005 11.7239 10.0039 12 10.0039H13C13.5523 10.0039 14 9.55619 14 9.00391V4.00391C14 3.45162 13.5523 3.00391 13 3.00391H1Z" fill="currentColor"/><path d="M6.45041 7.00643C6.50971 7.00046 6.5704 7.00502 6.62952 7.0209C6.67575 7.03326 6.71935 7.05208 6.75929 7.07634L10.2265 9.09876C10.2664 9.12106 10.3035 9.149 10.3366 9.18222C10.3798 9.22561 10.414 9.27597 10.4384 9.33038C10.4682 9.39673 10.4824 9.46686 10.4822 9.53619C10.4821 9.60554 10.4676 9.67562 10.4374 9.74185C10.4128 9.79612 10.3784 9.84632 10.335 9.8895C10.3018 9.92257 10.2646 9.95035 10.2245 9.97248L9.1496 10.5931L9.8996 11.8921C10.1067 12.2508 9.9838 12.7095 9.62508 12.9166C9.26636 13.1238 8.80767 13.0008 8.60056 12.6421L7.85056 11.3431L6.77563 11.9637C6.73646 11.9873 6.69378 12.0057 6.64855 12.0179C6.58942 12.0339 6.52873 12.0386 6.46941 12.0327C6.39698 12.0258 6.32904 12.0033 6.26895 11.9687C6.2088 11.9342 6.15518 11.8869 6.11265 11.8278C6.07771 11.7795 6.05119 11.7247 6.03524 11.6656C6.02298 11.6204 6.01735 11.5743 6.018 11.5285L6.00012 7.51465C5.99908 7.46793 6.00458 7.42076 6.017 7.37454C6.03285 7.31525 6.05933 7.26029 6.09428 7.21183C6.13666 7.15281 6.1901 7.10543 6.25004 7.0709C6.31004 7.03618 6.37794 7.01357 6.45041 7.00643Z" fill="currentColor"/></svg>`
const DOCS_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5.5C3 5.22386 3.22386 5 3.5 5H8.5C8.77614 5 9 5.22386 9 5.5C9 5.77614 8.77614 6 8.5 6H3.5C3.22386 6 3 5.77614 3 5.5Z" fill="currentColor"/><path d="M3.5 7.5C3.22386 7.5 3 7.72386 3 8C3 8.27614 3.22386 8.5 3.5 8.5H8.5C8.77614 8.5 9 8.27614 9 8C9 7.72386 8.77614 7.5 8.5 7.5H3.5Z" fill="currentColor"/><path d="M3 10.5C3 10.2239 3.22386 10 3.5 10H8.5C8.77614 10 9 10.2239 9 10.5C9 10.7761 8.77614 11 8.5 11H3.5C3.22386 11 3 10.7761 3 10.5Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M0.5 0C0.223858 0 0 0.223857 0 0.5V13.5C0 13.7761 0.223858 14 0.5 14H11.5C11.7761 14 12 13.7761 12 13.5V3.20711C12 3.0745 11.9473 2.94732 11.8536 2.85355L9.14645 0.146447C9.05268 0.0526784 8.9255 0 8.79289 0H0.5ZM1 1H8.5V3C8.5 3.27614 8.72386 3.5 9 3.5H11V13H1V1Z" fill="currentColor"/></svg>`
const EYE_ICON = `<svg width="12" height="12" viewBox="0 0 11.2368 13.9999" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.659982 0.615712C0.278813 0.639535 -0.013819 0.962974 0.000504064 1.34462L0.434194 12.9005C0.447931 13.2665 0.740084 13.5608 1.106 13.5773L10.5014 13.9992C10.5119 13.9997 10.5224 13.9999 10.533 13.9999C10.9217 13.9999 11.2368 13.6848 11.2368 13.2961V0.703904C11.2368 0.689258 11.2364 0.674615 11.2355 0.659997C11.2112 0.272012 10.877 -0.0228544 10.4891 0.00139464L9.71642 0.0497456L9.77284 1.6653C9.77487 1.72325 9.72953 1.77187 9.67157 1.7739C9.64676 1.77476 9.62244 1.76681 9.60293 1.75144L9.08239 1.34138L8.46609 1.80888C8.41989 1.84393 8.35402 1.83489 8.31898 1.78869C8.30422 1.76924 8.29671 1.74526 8.29772 1.72087L8.36369 0.134291L0.659982 0.615712ZM8.66356 5.36294C8.41593 5.5553 6.57131 5.68655 6.57131 5.4127C6.6103 4.36774 6.14247 4.32193 5.88256 4.32193C5.63565 4.32193 5.2198 4.39657 5.2198 4.95637C5.2198 5.52683 5.82752 5.84888 6.54082 6.22689C7.55413 6.76387 8.78051 7.41377 8.78051 9.04913C8.78051 10.6166 7.50697 11.4824 5.88256 11.4824C4.20616 11.4824 2.74118 10.8042 2.90663 8.45275C2.97161 8.17663 5.10284 8.24225 5.10284 8.45275C5.07685 9.42307 5.29777 9.70845 5.85657 9.70845C6.28541 9.70845 6.48034 9.47209 6.48034 9.07401C6.48034 8.47157 5.84715 8.11607 5.11874 7.7071C4.13246 7.15336 2.97161 6.50161 2.97161 5.00613C2.97161 3.51333 3.99824 2.51813 5.83058 2.51813C7.66292 2.51813 8.66356 3.49808 8.66356 5.36294Z" fill="currentColor"/></svg>`
const PLUS_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
const CHECK_ICON = `<svg width="12" height="12" viewBox="0 0 14 9.5" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.8536 0.853553C14.0488 0.658291 14.0488 0.341709 13.8536 0.146447C13.6583 -0.0488155 13.3417 -0.0488155 13.1464 0.146447L5 8.29289L0.853553 4.14645C0.658291 3.95118 0.341709 3.95118 0.146447 4.14645C-0.0488155 4.34171 -0.0488155 4.65829 0.146447 4.85355L4.64645 9.35355C4.84171 9.54882 5.15829 9.54882 5.35355 9.35355L13.8536 0.853553Z" fill="currentColor"/></svg>`
const ELLIPSIS_ICON = `<svg width="12" height="3" viewBox="0 0 12 3" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 1.5C3 2.32843 2.32843 3 1.5 3C0.671573 3 0 2.32843 0 1.5C0 0.671573 0.671573 0 1.5 0C2.32843 0 3 0.671573 3 1.5Z" fill="currentColor"/><path d="M12 1.5C12 2.32843 11.3284 3 10.5 3C9.67157 3 9 2.32843 9 1.5C9 0.671573 9.67157 0 10.5 0C11.3284 0 12 0.671573 12 1.5Z" fill="currentColor"/><path d="M6 3C6.82843 3 7.5 2.32843 7.5 1.5C7.5 0.671573 6.82843 0 6 0C5.17157 0 4.5 0.671573 4.5 1.5C4.5 2.32843 5.17157 3 6 3Z" fill="currentColor"/></svg>`
const BULLSEYE_ICON = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 7C0 3.13401 3.13401 0 7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7ZM6.5 10.5V12.9795C3.5851 12.739 1.26101 10.4149 1.02054 7.5H3.5C3.77614 7.5 4 7.27614 4 7C4 6.72386 3.77614 6.5 3.5 6.5H1.02054C1.26101 3.5851 3.5851 1.26101 6.5 1.02054V3.5C6.5 3.77614 6.72386 4 7 4C7.27614 4 7.5 3.77614 7.5 3.5V1.02054C10.4149 1.26101 12.739 3.5851 12.9795 6.5H10.5C10.2239 6.5 10 6.72386 10 7C10 7.27614 10.2239 7.5 10.5 7.5H12.9795C12.739 10.4149 10.4149 12.739 7.5 12.9795V10.5C7.5 10.2239 7.27614 10 7 10C6.72386 10 6.5 10.2239 6.5 10.5Z" fill="currentColor"/></svg>`

// ─── Types ──────────────────────────────────────────────────────────

interface CoverageEntry {
  componentName: string
  filePath: string
  relativeFilePath: string
  hasStory: boolean
  storyPath: string | null
}

interface CoverageData {
  entries: CoverageEntry[]
  totalComponents: number
  coveredComponents: number
  coveragePercent: number
}

// ─── Helpers ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function coverageColorClass(pct: number): string {
  if (pct >= 80) return 'green'
  if (pct >= 50) return 'yellow'
  if (pct >= 25) return 'orange'
  return 'red'
}

function openInEditor(filePath: string) {
  fetch(`/__open-in-editor?file=${encodeURIComponent(filePath)}`).catch(
    () => {},
  )
}

/** Get the storybookUrl from the query string (set by the server plugin) */
function getStorybookUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('sbUrl') || 'http://localhost:6006'
}

// ─── Visit Story ────────────────────────────────────────────────────

interface StorybookIndexEntry {
  id: string
  title: string
  name: string
  importPath: string
  type: string
}

let storybookIndexCache: Record<string, StorybookIndexEntry> | null = null
let storybookIndexFetchedAt = 0

async function getStorybookIndex(): Promise<
  Record<string, StorybookIndexEntry>
> {
  // Cache for 30 seconds
  if (storybookIndexCache && Date.now() - storybookIndexFetchedAt < 30_000) {
    return storybookIndexCache
  }
  try {
    const res = await fetch('/__component-highlighter/storybook-index')
    const data = await res.json()
    storybookIndexCache = data.entries || {}
    storybookIndexFetchedAt = Date.now()
    return storybookIndexCache!
  } catch {
    return {}
  }
}

/**
 * Normalise a story name for loose comparison: lower-case and strip spaces.
 * Storybook derives display names from export names by inserting spaces
 * (e.g. export `TaskForm` → name `"Task Form"`).  When we want to match the
 * name we used during creation we normalise both sides so that
 * "Secondary" === "secondary", "Task Form" === "taskform", etc.
 */
function normaliseStoryName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '')
}

/**
 * Find a story ID by matching the component's relative file path against
 * Storybook index entries' importPath.
 *
 * When `preferredStoryName` is supplied the function first looks for a story
 * whose `name` matches (normalised); only if that fails does it fall back to
 * the first story found for the component file.
 */
async function findStoryId(
  relativeFilePath: string,
  preferredStoryName?: string,
): Promise<string | null> {
  const entries = await getStorybookIndex()
  if (!entries || Object.keys(entries).length === 0) return null

  // Strip leading ./ and file extension to get the component base path
  const stripExt = (p: string) =>
    p.replace(/^\.\//, '').replace(/\.(stories\.)?(tsx?|jsx?|mts|mjs)$/, '')

  const componentBase = stripExt(relativeFilePath)
  // Also extract just the filename without extension for fallback matching
  const componentName = componentBase.split('/').pop() || componentBase

  // Collect all candidate entries for this component file (preserving order)
  const candidates: StorybookIndexEntry[] = []

  for (const entry of Object.values(entries)) {
    if (entry.type !== 'story') continue
    const entryBase = stripExt(entry.importPath)
    if (entryBase === componentBase || entryBase.endsWith(componentName)) {
      candidates.push(entry)
    }
  }

  if (candidates.length === 0) return null

  // If the caller knows which story name was just created, prefer it
  if (preferredStoryName) {
    const needle = normaliseStoryName(preferredStoryName)
    const match = candidates.find((e) => normaliseStoryName(e.name) === needle)
    if (match) return match.id
  }

  // Fall back to the first candidate
  return candidates[0]!.id
}

/**
 * Build a Storybook URL for a specific story.
 * Returns null if no matching story is found.
 */
async function buildStoryUrl(
  relativeFilePath: string,
  preferredStoryName?: string,
): Promise<string | null> {
  const storyId = await findStoryId(relativeFilePath, preferredStoryName)
  if (!storyId) return null
  const sbUrl = getStorybookUrl()
  return `${sbUrl}/?path=/story/${encodeURIComponent(storyId)}&nav=0`
}

/**
 * Navigate to a story in the Storybook iframe.
 *
 * @param relativeFilePath - Component's relative file path.
 * @param preferredStoryName - Optional story name to prefer when multiple
 *   stories exist for the component (e.g. the name used during creation).
 *   When provided, the function will also retry index lookups with cache
 *   invalidation so that a story that was just written to disk is found even
 *   before Storybook's HMR cycle finishes.
 */
async function visitStory(
  relativeFilePath: string,
  preferredStoryName?: string,
) {
  const running = await checkStorybook()
  if (running) {
    // Fast path: Storybook is already running, index is available.
    // For newly created stories the index cache may be stale — bust it and
    // retry until the story appears (Storybook needs a moment to process HMR).
    const maxAttempts = preferredStoryName ? 20 : 1
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // Bust the index cache so we re-fetch on the next iteration
        storybookIndexCache = null
        await new Promise((r) => setTimeout(r, 500))
      }
      const storyId = await findStoryId(relativeFilePath, preferredStoryName)
      if (storyId) {
        switchTab('storybook')
        // Try channel API first (no reload), fall back to iframe src navigation
        if (!navigateStorybookViaChannel(storyId)) {
          const targetUrl = await buildStoryUrl(
            relativeFilePath,
            preferredStoryName,
          )
          if (targetUrl) navigateStorybookPane(targetUrl)
        }
        return
      }
    }
    return
  }

  // Start Storybook, show terminal, then navigate once ready
  renderStorybookState('starting')
  try {
    await fetch('/__component-highlighter/start-storybook', { method: 'POST' })
  } catch {
    // Server may not support terminal start
  }

  showTerminalTab()
  switchTab('terminal')

  // Poll until Storybook is ready, then build the URL and navigate
  let attempts = 0
  const poll = setInterval(async () => {
    attempts++
    const isRunning = await checkStorybook()
    if (isRunning) {
      clearInterval(poll)
      renderStorybookState('running')
      switchTab('storybook')
      // Storybook just started — index may take a moment to become available
      for (let retry = 0; retry < 10; retry++) {
        storybookIndexCache = null
        const storyId = await findStoryId(relativeFilePath, preferredStoryName)
        if (storyId) {
          if (!navigateStorybookViaChannel(storyId)) {
            const targetUrl = await buildStoryUrl(
              relativeFilePath,
              preferredStoryName,
            )
            if (targetUrl) navigateStorybookPane(targetUrl)
          }
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
    } else if (attempts > 120) {
      clearInterval(poll)
      renderStorybookState('not-running')
    }
  }, 1000)
}

// ─── Action popover (singleton, reused per row) ─────────────────────────────
let _actionPopover: HTMLDivElement | null = null

function getActionPopover(): HTMLDivElement {
  if (!_actionPopover) {
    _actionPopover = document.createElement('div')
    _actionPopover.className = 'act-popover'
    _actionPopover.hidden = true
    document.body.appendChild(_actionPopover)
    document.addEventListener('click', () => {
      if (_actionPopover) _actionPopover.hidden = true
    })
  }
  return _actionPopover
}

function makePopoverItem(
  icon: string,
  label: string,
  action: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'act-popover-item'
  btn.innerHTML = `${icon}<span>${label}</span>`
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    getActionPopover().hidden = true
    action()
  })
  return btn
}

function showActionPopover(anchor: HTMLElement, entry: CoverageEntry) {
  const popover = getActionPopover()
  // Toggle off if already open for this entry
  if (!popover.hidden && popover.dataset.entry === entry.componentName) {
    popover.hidden = true
    return
  }

  popover.innerHTML = ''
  popover.dataset.entry = entry.componentName

  popover.appendChild(makePopoverItem(BULLSEYE_ICON, 'Locate component', () => { rpcCall('component-highlighter:scroll-to-component', { componentName: entry.componentName }).catch(() => {}) }))
  popover.appendChild(makePopoverItem(CODE_ICON, 'Open component in editor', () => openInEditor(entry.filePath)))
  if (entry.hasStory && entry.storyPath) {
    popover.appendChild(makePopoverItem(CODE_ICON, 'Open story in editor', () => openInEditor(entry.storyPath!)))
  }
  if (entry.hasStory) {
    popover.appendChild(makePopoverItem(EYE_ICON, 'View story in Storybook', () => visitStory(entry.relativeFilePath)))
  }

  const rect = anchor.getBoundingClientRect()
  popover.style.top = `${rect.bottom + 4}px`
  popover.style.left = `${rect.right}px`
  popover.style.transform = 'translateX(-100%)'
  popover.hidden = false
}

/**
 * Navigate to a story via the Storybook channel API (postMessage).
 * This avoids a full page reload when Storybook is already loaded.
 * Returns true if the channel was available and the message was sent.
 */
function navigateStorybookViaChannel(storyId: string): boolean {
  const iframe = document.querySelector<HTMLIFrameElement>('.sb-iframe')
  if (!iframe?.contentWindow) return false
  try {
    const channel = (iframe.contentWindow as any).__STORYBOOK_ADDONS_CHANNEL__
    if (!channel || typeof channel.emit !== 'function') return false
    channel.emit('setCurrentStory', { storyId, viewMode: 'story' })
    return true
  } catch {
    return false // cross-origin or not loaded yet
  }
}

/** Set the Storybook iframe to a given URL, creating it if needed. */
function navigateStorybookPane(targetUrl: string) {
  const pane = document.getElementById('pane-storybook')
  if (!pane) return

  const iframe = pane.querySelector<HTMLIFrameElement>('.sb-iframe')
  if (iframe) {
    iframe.src = targetUrl
  } else {
    pane.innerHTML = `<iframe class="sb-iframe" src="${esc(targetUrl)}"></iframe>`
  }
}

// Register panel-side client RPC handlers so the server can communicate with the panel
// in real time (works whether panel is inline or popped out)
function registerPanelRpcHandlers() {
  if (!rpcClient?.client) return
  try {
    rpcClient.client.register({
      name: 'component-highlighter:do-visit-story',
      type: 'action',
      handler: (data: {
        relativeFilePath: string
        preferredStoryName?: string
      }) => {
        visitStory(data.relativeFilePath, data.preferredStoryName)
      },
    } as any)

    rpcClient.client.register({
      name: 'component-highlighter:do-switch-tab',
      type: 'action',
      handler: (data: { tab: string }) => {
        switchTab(data.tab as TabId)
      },
    } as any)
  } catch {
    // Client RPC registration not supported in this context
  }
}

/** Ask the client to remove all coverage highlight overlays via RPC */
function clearAllHighlights() {
  rpcCall('component-highlighter:highlight-coverage-instances', null).catch(
    () => {},
  )
}

// ─── Tab management ─────────────────────────────────────────────────

type TabId = 'storybook' | 'coverage' | 'terminal' | 'docs'

let activeTab: TabId = 'storybook'
let coverageInterval: ReturnType<typeof setInterval> | null = null
let terminalInterval: ReturnType<typeof setInterval> | null = null
let terminalLogOffset = 0

// Terminal badge state
let terminalUnseenCount = 0
let terminalHasError = false
let highlightEnabled = false
let terminalTabVisible = false

function showTerminalTab() {
  if (terminalTabVisible) return
  terminalTabVisible = true
  const termTabBtn = document.querySelector(
    '.tab-btn[data-tab="terminal"]',
  ) as HTMLElement | null
  if (termTabBtn) termTabBtn.style.display = ''
}

const ERROR_PATTERN =
  /\b(error|ERR!|fail|fatal|exception|stack\s*trace|ENOENT|EACCES|TypeError|ReferenceError|SyntaxError|Cannot find|Unexpected token)\b/i

function updateTerminalBadge() {
  const badge = document.getElementById('terminal-badge')
  if (!badge) return

  if (activeTab === 'terminal' || terminalUnseenCount === 0) {
    badge.style.display = 'none'
    return
  }

  badge.style.display = 'inline-flex'
  badge.textContent =
    terminalUnseenCount > 99 ? '99+' : String(terminalUnseenCount)
  badge.className = `tab-badge ${terminalHasError ? 'error' : 'info'}`
}

function clearTerminalBadge() {
  terminalUnseenCount = 0
  terminalHasError = false
  updateTerminalBadge()
}

function switchTab(tab: TabId) {
  activeTab = tab
  clearAllHighlights()

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab)
  })

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${tab}`)
  })

  // Start/stop coverage polling
  if (tab === 'coverage') {
    refreshCoverage()
    if (!coverageInterval) {
      coverageInterval = setInterval(refreshCoverage, 5000)
    }
  } else {
    if (coverageInterval) {
      clearInterval(coverageInterval)
      coverageInterval = null
    }
  }

  // Start/stop terminal polling
  if (tab === 'terminal') {
    clearTerminalBadge()
    pollTerminalLogs()
    if (!terminalInterval) {
      terminalInterval = setInterval(pollTerminalLogs, 1000)
    }
  } else {
    if (terminalInterval) {
      clearInterval(terminalInterval)
      terminalInterval = null
    }
  }
}

// ─── Storybook tab ──────────────────────────────────────────────────

type SbState = 'checking' | 'not-running' | 'starting' | 'running'

function renderStorybookState(state: SbState) {
  const pane = document.getElementById('pane-storybook')
  if (!pane) return

  const sbUrl = getStorybookUrl()

  switch (state) {
    case 'checking':
      pane.innerHTML = `
        <div class="sb-state">
          <div class="spinner"></div>
          <div class="msg">Checking if Storybook is running\u2026</div>
        </div>`
      break

    case 'not-running':
      pane.innerHTML = `
        <div class="sb-state">
          <div class="msg">Storybook is not running at <strong>${esc(sbUrl)}</strong></div>
          <button class="start-btn" id="sb-start-btn">Start Storybook</button>
        </div>`
      document
        .getElementById('sb-start-btn')
        ?.addEventListener('click', startStorybook)
      break

    case 'starting':
      pane.innerHTML = `
        <div class="sb-state">
          <div class="spinner"></div>
          <div class="msg">Starting Storybook\u2026</div>
        </div>`
      break

    case 'running':
      pane.innerHTML = `<iframe class="sb-iframe" src="${esc(sbUrl)}"></iframe>`
      break
  }
}

async function checkStorybook(): Promise<boolean> {
  try {
    const res = await fetch('/__component-highlighter/storybook-status')
    const data = await res.json()
    return data.running === true
  } catch {
    return false
  }
}

async function initStorybookTab() {
  renderStorybookState('checking')
  const running = await checkStorybook()
  renderStorybookState(running ? 'running' : 'not-running')
}

async function startStorybook() {
  renderStorybookState('starting')

  try {
    await fetch('/__component-highlighter/start-storybook', { method: 'POST' })
  } catch {
    // Server may not support terminal start; fall through to polling
  }

  // Show and switch to the terminal tab so the user can watch the logs
  showTerminalTab()
  switchTab('terminal')

  // Poll until Storybook is ready (max ~120s)
  let attempts = 0
  const poll = setInterval(async () => {
    attempts++
    const running = await checkStorybook()
    if (running) {
      clearInterval(poll)
      renderStorybookState('running')
      // Auto-switch back to the Storybook tab once it's up
      switchTab('storybook')
    } else if (attempts > 120) {
      clearInterval(poll)
      renderStorybookState('not-running')
    }
  }, 1000)
}

// ─── Story creation from coverage ───────────────────────────────────

/**
 * Build a fingerprint string for serialized props, ignoring functions and JSX.
 * Used to deduplicate component instances that represent the same variant.
 */
function propsFingerprint(props: Record<string, unknown>): string {
  const meaningful: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>
      if (v['__isFunction'] || v['__isJSX']) continue
    }
    if (typeof value === 'function') continue
    meaningful[key] = value
  }
  return JSON.stringify(meaningful, Object.keys(meaningful).sort())
}

/** Fetch the registry snapshot from the server (RPC) */
/** Read the registry from shared state (synced automatically from client) */
function fetchRegistry(): RegistryInstance[] {
  try {
    return (registrySharedState?.value() as RegistryInstance[]) ?? []
  } catch {
    return []
  }
}

/**
 * Collect unique instances of a component from the server registry snapshot,
 * deduplicated by their serialized props fingerprint.
 */
async function collectUniqueInstances(
  filePath: string,
): Promise<RegistryInstance[]> {
  const instances = await fetchRegistry()
  const seen = new Map<string, RegistryInstance>()
  for (const instance of instances) {
    if (instance.meta?.filePath !== filePath) continue
    if (!instance.isConnected) continue
    const sp = instance.serializedProps
    const fp = sp ? propsFingerprint(sp) : '{}'
    if (!seen.has(fp)) {
      seen.set(fp, instance)
    }
  }
  return Array.from(seen.values())
}

/**
 * Collect all unique visible instances across ALL components from the server
 * registry snapshot. Deduplicates by (filePath + propsFingerprint).
 */
async function collectAllVisibleInstances(): Promise<RegistryInstance[]> {
  const instances = await fetchRegistry()
  const seen = new Map<string, RegistryInstance>()
  for (const instance of instances) {
    const filePath = instance.meta?.filePath
    if (!filePath || !instance.isConnected) continue
    const sp = instance.serializedProps
    const fp = sp ? propsFingerprint(sp) : '{}'
    const key = `${filePath}::${fp}`
    if (!seen.has(key)) {
      seen.set(key, instance)
    }
  }
  return Array.from(seen.values())
}

/**
 * Create stories for a component by calling the server's create-story RPC
 * directly with instance data from the registry snapshot.
 */
async function createStoryForComponent(filePath: string): Promise<boolean> {
  const instances = await collectUniqueInstances(filePath)
  if (instances.length === 0) return false

  for (const instance of instances) {
    try {
      await rpcCall('component-highlighter:create-story', {
        meta: instance.meta,
        props: instance.props,
        serializedProps: instance.serializedProps,
      })
    } catch {
      // Best effort; continue with remaining instances
    }
  }
  return true
}

/**
 * Check whether a component is currently rendered using the server registry snapshot.
 */
// ─── Coverage tab ───────────────────────────────────────────────────

let lastCoverageJson = ''
let lastVisibilityKey = ''

async function fetchCoverage(): Promise<CoverageData | null> {
  try {
    const res = await fetch('/__component-highlighter/coverage')
    return await res.json()
  } catch {
    return null
  }
}

/** Build a key from the registry's connected file paths to detect navigation. */
function computeRegistryKey(): string {
  const instances = fetchRegistry()
  const paths = new Set<string>()
  for (const inst of instances) {
    if (inst.meta?.filePath && inst.isConnected) {
      paths.add(inst.meta.filePath)
    }
  }
  return [...paths].sort().join('|')
}

async function refreshCoverage() {
  const coverage = await fetchCoverage()
  if (!coverage) return

  // Rebuild when server-side coverage data or visible components change
  const json = JSON.stringify(coverage)
  const regKey = computeRegistryKey()
  if (json === lastCoverageJson && regKey === lastVisibilityKey) return
  lastCoverageJson = json
  lastVisibilityKey = regKey

  clearAllHighlights()
  await buildCoveragePanel(coverage)
}

async function buildCoveragePanel(coverage: CoverageData) {
  const pane = document.getElementById('pane-coverage')
  if (!pane) return

  // Filter to only components visible on the current page
  const registryInstances = await fetchRegistry()
  const visibleFilePaths = new Set<string>()
  for (const inst of registryInstances) {
    if (inst.meta?.filePath && inst.isConnected) {
      visibleFilePaths.add(inst.meta.filePath)
    }
  }
  const visibleEntries = coverage.entries.filter((e) =>
    visibleFilePaths.has(e.filePath),
  )
  const totalVisible = visibleEntries.length
  const coveredVisible = visibleEntries.filter((e) => e.hasStory).length
  const pctVisible =
    totalVisible > 0 ? Math.round((coveredVisible / totalVisible) * 100) : 0

  const root = document.createElement('div')
  root.className = 'coverage-root'

  // Header
  const hdr = document.createElement('div')
  hdr.className = 'cov-hdr'

  const title = document.createElement('h2')
  title.textContent = 'Story Coverage (on this page)'
  hdr.appendChild(title)

  const pct = document.createElement('span')
  const cc = coverageColorClass(pctVisible)
  pct.className = `pct ${cc}`
  pct.textContent = `${pctVisible}%`
  hdr.appendChild(pct)

  root.appendChild(hdr)

  // Progress bar
  const pw = document.createElement('div')
  pw.className = 'progress-wrap'

  const pl = document.createElement('div')
  pl.className = 'progress-label'
  pl.textContent = `${coveredVisible} of ${totalVisible} components on this page have story files`
  pw.appendChild(pl)

  const barRow = document.createElement('div')
  barRow.className = 'progress-row'

  const bar = document.createElement('div')
  bar.className = 'progress-bar'
  const fill = document.createElement('div')
  fill.className = `progress-fill ${cc}`
  fill.style.width = `${pctVisible}%`
  bar.appendChild(fill)
  barRow.appendChild(bar)

  // "Create all" button — creates stories for every uncovered instance on screen,
  // deduplicated by (filePath + props fingerprint) so identical mounts are skipped.
  const allVisibleInstances = await collectAllVisibleInstances()
  const uncoveredFilePaths = new Set(
    visibleEntries.filter((e) => !e.hasStory).map((e) => e.filePath),
  )
  const uncoveredInstances = allVisibleInstances.filter(
    (inst) => inst.meta?.filePath && uncoveredFilePaths.has(inst.meta.filePath),
  )
  if (uncoveredInstances.length > 0) {
    const createAllBtn = document.createElement('button')
    createAllBtn.className = 'create-all-btn'
    createAllBtn.textContent = `Create all (${uncoveredInstances.length})`
    createAllBtn.title = `Create stories for ${uncoveredInstances.length} uncovered component instance${uncoveredInstances.length === 1 ? '' : 's'} on screen`
    createAllBtn.addEventListener('click', async () => {
      createAllBtn.disabled = true
      createAllBtn.textContent = 'Creating\u2026'
      for (const instance of uncoveredInstances) {
        try {
          await rpcCall('component-highlighter:create-story', {
            meta: instance.meta,
            props: instance.props,
            serializedProps: instance.serializedProps,
            skipNavigation: true,
          })
        } catch {
          // Best effort
        }
      }
      // Wait for the RPC story creation to complete, then refresh
      setTimeout(() => {
        lastCoverageJson = ''
        refreshCoverage()
      }, 1500)
    })
    barRow.appendChild(createAllBtn)
  }

  pw.appendChild(barRow)
  root.appendChild(pw)

  // Table
  if (visibleEntries.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent =
      'No components detected yet. Navigate your app to discover components.'
    root.appendChild(empty)
    pane.innerHTML = ''
    pane.appendChild(root)
    return
  }

  const wrap = document.createElement('div')
  wrap.className = 'table-wrap'

  const table = document.createElement('table')
  const thead = document.createElement('thead')
  thead.innerHTML = `<tr><th>Component</th><th>Status</th><th>Actions</th></tr>`
  table.appendChild(thead)

  const tbody = document.createElement('tbody')

  // Highlight/clear helpers — delegate to client via RPC broadcast
  const highlightInstances = (componentName: string, hasStory: boolean) => {
    rpcCall('component-highlighter:highlight-coverage-instances', {
      componentName,
      hasStory,
    }).catch(() => {})
  }

  const clearHighlights = () => {
    rpcCall('component-highlighter:highlight-coverage-instances', null).catch(
      () => {},
    )
  }

  for (const entry of visibleEntries) {
    const tr = document.createElement('tr')
    tr.className = `row ${entry.hasStory ? 'covered' : 'uncovered'}`

    // Component name + file
    const tdName = document.createElement('td')
    tdName.innerHTML = `
      <div class="comp-name">${esc(entry.componentName)}</div>
      <div class="comp-file" title="${esc(entry.relativeFilePath)}">${esc(entry.relativeFilePath)}</div>
    `
    tr.appendChild(tdName)

    // Status badge
    const tdStatus = document.createElement('td')
    if (entry.hasStory) {
      tdStatus.innerHTML = `<span class="status covered"><span class="status-dot"></span>Covered</span>`
    } else {
      tdStatus.innerHTML = `<span class="status missing"><span class="status-dot"></span>Missing</span>`
    }
    tr.appendChild(tdStatus)

    // Action buttons
    const tdActions = document.createElement('td')
    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'actions'

    // More actions button — opens popover with editor/Storybook actions
    const moreBtn = document.createElement('button')
    moreBtn.className = 'act-btn more-btn'
    moreBtn.innerHTML = ELLIPSIS_ICON
    moreBtn.title = 'Edit files, view story, and more'
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      showActionPopover(moreBtn, entry)
    })
    actionsDiv.appendChild(moreBtn)

    // Covered indicator — always visible on rows with a story
    if (entry.hasStory) {
      const coveredBtn = document.createElement('button')
      coveredBtn.className = 'act-btn covered-indicator'
      coveredBtn.innerHTML = CHECK_ICON
      coveredBtn.disabled = true
      actionsDiv.appendChild(coveredBtn)
    }

    // Create story button (only for uncovered components)
    if (!entry.hasStory) {
      const createBtn = document.createElement('button')
      createBtn.className = 'act-btn create'
      createBtn.innerHTML = PLUS_ICON
      createBtn.title = 'Create story from current props'
      createBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        createBtn.disabled = true
        createBtn.style.opacity = '0.5'
        const created = await createStoryForComponent(entry.filePath)
        if (created) {
          // Wait for the RPC story creation to complete, then refresh
          setTimeout(() => {
            lastCoverageJson = ''
            refreshCoverage()
          }, 1500)
        } else {
          createBtn.disabled = false
          createBtn.style.opacity = ''
        }
      })
      actionsDiv.appendChild(createBtn)
    }

    tdActions.appendChild(actionsDiv)
    tr.appendChild(tdActions)

    // Hover → highlight matching component instances on the app page via RPC
    tr.addEventListener('mouseenter', () => {
      highlightInstances(entry.componentName, entry.hasStory)
    })

    tr.addEventListener('mouseleave', clearHighlights)

    tbody.appendChild(tr)
  }

  table.appendChild(tbody)
  wrap.appendChild(table)
  root.appendChild(wrap)

  pane.innerHTML = ''
  pane.appendChild(root)
}

// ─── Terminal tab ───────────────────────────────────────────────────

/** Strip ANSI escape codes for plain-text display */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

async function pollTerminalLogs() {
  try {
    const res = await fetch(
      `/__component-highlighter/terminal-logs?since=${terminalLogOffset}`,
    )
    const data: { lines: string[]; total: number } = await res.json()

    if (data.lines.length > 0) {
      terminalLogOffset = data.total

      // Track unseen lines and errors for the badge (when not on terminal tab)
      if (activeTab !== 'terminal') {
        terminalUnseenCount += data.lines.length
        if (!terminalHasError) {
          for (const line of data.lines) {
            if (ERROR_PATTERN.test(stripAnsi(line))) {
              terminalHasError = true
              break
            }
          }
        }
        updateTerminalBadge()
      }

      const output = document.getElementById('terminal-output')
      if (!output) return

      for (const line of data.lines) {
        const div = document.createElement('div')
        const stripped = stripAnsi(line)
        div.className = 'term-line'
        if (ERROR_PATTERN.test(stripped)) {
          div.classList.add('term-error')
        }
        div.textContent = stripped
        output.appendChild(div)
      }

      // Auto-scroll to bottom
      output.scrollTop = output.scrollHeight
    }
  } catch {
    // endpoint not ready yet
  }
}

/** Background poller — runs always so terminal badge stays updated even when on other tabs */
let bgTerminalInterval: ReturnType<typeof setInterval> | null = null

function startBackgroundTerminalPoller() {
  if (bgTerminalInterval) return
  bgTerminalInterval = setInterval(() => {
    // Only poll in background when we're NOT on the terminal tab
    // (the terminal tab has its own faster poller)
    if (activeTab !== 'terminal') {
      pollTerminalLogs()
    }
  }, 2000)
}

// ─── Bootstrap ──────────────────────────────────────────────────────

function init() {
  const app = document.getElementById('app')!

  app.style.display = 'flex'
  app.style.flexDirection = 'column'
  app.style.height = '100%'

  // Tab bar
  const tabBar = document.createElement('div')
  tabBar.className = 'tab-bar'

  const sbTab = document.createElement('button')
  sbTab.className = 'tab-btn active'
  sbTab.setAttribute('data-tab', 'storybook')
  sbTab.innerHTML = `${SB_TAB_ICON} Storybook`
  sbTab.addEventListener('click', () => switchTab('storybook'))

  const covTab = document.createElement('button')
  covTab.className = 'tab-btn'
  covTab.setAttribute('data-tab', 'coverage')
  covTab.innerHTML = `${COVERAGE_TAB_ICON} Coverage`
  covTab.addEventListener('click', () => switchTab('coverage'))

  const termTab = document.createElement('button')
  termTab.className = 'tab-btn'
  termTab.setAttribute('data-tab', 'terminal')
  termTab.style.display = 'none' // Hidden until "Start Storybook" is clicked
  termTab.innerHTML = `${TERMINAL_TAB_ICON} Terminal <span id="terminal-badge" class="tab-badge" style="display:none"></span>`
  termTab.addEventListener('click', () => switchTab('terminal'))

  // Spacer pushes highlight button to the right
  const spacer = document.createElement('div')
  spacer.style.flex = '1'

  // Highlight toggle button — delegates to client via RPC
  const highlightBtn = document.createElement('button')
  highlightBtn.className = 'highlight-toggle-btn'
  highlightBtn.id = 'highlight-toggle'
  highlightBtn.innerHTML = `${CROSSHAIR_ICON}`
  highlightBtn.title = 'Toggle component highlight mode'
  highlightBtn.addEventListener('click', () => {
    highlightEnabled = !highlightEnabled
    highlightBtn.classList.toggle('active', highlightEnabled)
    rpcCall('component-highlighter:set-highlight-mode', {
      enabled: highlightEnabled,
    }).catch(() => {})
  })

  const docsTab = document.createElement('button')
  docsTab.className = 'tab-btn'
  docsTab.setAttribute('data-tab', 'docs')
  docsTab.innerHTML = `${DOCS_TAB_ICON} Docs`
  docsTab.addEventListener('click', () => switchTab('docs'))

  tabBar.appendChild(sbTab)
  tabBar.appendChild(covTab)
  tabBar.appendChild(termTab)
  tabBar.appendChild(docsTab)
  tabBar.appendChild(spacer)
  tabBar.appendChild(highlightBtn)
  app.appendChild(tabBar)

  // Tab content
  const content = document.createElement('div')
  content.className = 'tab-content'

  const sbPane = document.createElement('div')
  sbPane.className = 'tab-pane active'
  sbPane.id = 'pane-storybook'

  const covPane = document.createElement('div')
  covPane.className = 'tab-pane'
  covPane.id = 'pane-coverage'
  covPane.innerHTML =
    '<div class="coverage-root"><div class="empty">Loading coverage data\u2026</div></div>'

  const termPane = document.createElement('div')
  termPane.className = 'tab-pane'
  termPane.id = 'pane-terminal'
  termPane.innerHTML = `
    <div class="terminal-root">
      <div class="term-header">
        <span>Storybook Terminal Output</span>
        <button class="term-clear-btn" id="term-clear-btn">Clear</button>
      </div>
      <div class="term-output" id="terminal-output"></div>
    </div>`

  const docsPane = document.createElement('div')
  docsPane.className = 'tab-pane'
  docsPane.id = 'pane-docs'
  docsPane.innerHTML =
    '<iframe class="sb-iframe" src="https://storybook.js.org/docs"></iframe>'

  content.appendChild(sbPane)
  content.appendChild(covPane)
  content.appendChild(termPane)
  content.appendChild(docsPane)
  app.appendChild(content)

  // Wire up the clear button after DOM is ready
  document.getElementById('term-clear-btn')?.addEventListener('click', () => {
    const output = document.getElementById('terminal-output')
    if (output) output.innerHTML = ''
  })

  // Init RPC client for communication with server/client
  // Init RPC client — also sets up shared state subscriptions for
  // pending visit/tab, registry, and highlight toggle sync.
  initRpcClient().then(() => {
    registerPanelRpcHandlers()
  })

  // Init storybook tab
  initStorybookTab()

  // Start background terminal poller for badge updates
  startBackgroundTerminalPoller()

  // Clean up highlights when the panel iframe is hidden or unloaded
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAllHighlights()
  })
  window.addEventListener('pagehide', clearAllHighlights)
  window.addEventListener('beforeunload', clearAllHighlights)
}

init()
