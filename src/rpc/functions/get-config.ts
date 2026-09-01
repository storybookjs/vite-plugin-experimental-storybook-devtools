import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'
import { getStorybookDocsUrl } from '../../utils/storybook-docs-url'

// Panel bootstrap: the auto-derived panel dock URL can't carry query
// params, so the panel fetches its config here.
export const getConfig = defineRpcFunction({
  name: 'get-config',
  type: 'query',
  setup: (ctx) => {
    const { storybookUrl, framework } = getStorybookDevframeContext(ctx)
    return {
      handler: () => ({
        storybookUrl,
        cwd: ctx.cwd,
        storybookDocsUrl: getStorybookDocsUrl(framework.storybookFramework),
      }),
    }
  },
})
