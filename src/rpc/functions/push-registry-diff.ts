import { defineRpcFunction } from 'devframe'
import type {
  RegistryDiff,
  SerializedRegistryInstance,
} from '../../shared-types'
import { getStorybookDevframeContext } from '../../context'

// Client pushes incremental diffs; server applies them to shared state
export const pushRegistryDiff = defineRpcFunction({
  name: 'push-registry-diff',
  type: 'action',
  setup: (ctx) => {
    const { state } = getStorybookDevframeContext(ctx)
    return {
      handler: (diff: RegistryDiff) => {
        if (!state.registryState) return
        state.registryState.mutate((draft: SerializedRegistryInstance[]) => {
          // Full sync: replace the entire registry
          if (diff.fullSync) {
            draft.length = 0
            for (const inst of diff.added) {
              draft.push(inst)
            }
            return
          }
          // Remove
          for (const id of diff.removed) {
            const idx = draft.findIndex((inst) => inst.id === id)
            if (idx !== -1) draft.splice(idx, 1)
          }
          // Add (deduplicate by id to prevent stale re-pushes)
          for (const inst of diff.added) {
            const existing = draft.findIndex((i) => i.id === inst.id)
            if (existing !== -1) {
              draft[existing] = inst
            } else {
              draft.push(inst)
            }
          }
          // Update
          for (const inst of diff.updated) {
            const idx = draft.findIndex((i) => i.id === inst.id)
            if (idx !== -1) draft[idx] = inst
            else draft.push(inst)
          }
        })
      },
    }
  },
})
