import { defineRpcFunction } from 'devframe'
import type { SerializedProps } from '../../frameworks'
import { getStorybookDevframeContext } from '../../context'

export interface ComponentHighlightData {
  meta: {
    componentName: string
    filePath: string
    relativeFilePath?: string
    sourceId: string
    isDefaultExport?: boolean
  }
  props: Record<string, unknown>
  serializedProps?: SerializedProps
  rect: DOMRect
}

export const highlightTarget = defineRpcFunction({
  name: 'highlight-target',
  type: 'action',
  setup: (ctx) => {
    const { logDebug } = getStorybookDevframeContext(ctx)
    return {
      handler: (data: ComponentHighlightData | null) => {
        logDebug('Highlight target:', data)
      },
    }
  },
})
