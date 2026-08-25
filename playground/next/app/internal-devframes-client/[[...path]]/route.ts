import { createStorybookDevtoolsClientBundleRoute } from 'vite-plugin-experimental-storybook-devtools/next'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { GET } = createStorybookDevtoolsClientBundleRoute()
