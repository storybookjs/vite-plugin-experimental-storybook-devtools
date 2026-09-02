import { createStorybookDevtoolsClientBundleRoute } from '@storybook/experimental-devtools/next'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { GET } = createStorybookDevtoolsClientBundleRoute()
