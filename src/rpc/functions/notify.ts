import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

// Client → server: show a toast notification
export const notify = defineRpcFunction({
  name: 'notify',
  type: 'action',
  setup: (ctx) => {
    const { state } = getStorybookDevframeContext(ctx)
    return {
      handler: (data: { message: string; level?: string }) => {
        const level =
          (data.level as 'info' | 'warn' | 'error' | 'success') || 'info'
        state.notifications.notify({
          message: data.message,
          level,
          toast: true,
          autoDismissMs: 3000,
          category: 'component-highlighter',
        })
      },
    }
  },
})
