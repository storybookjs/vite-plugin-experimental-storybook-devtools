import { ClientApp } from './components/ClientApp'
import { HydrationInfo } from './components/HydrationInfo'
import { ServerInfo } from './components/ServerInfo'

export default function Page() {
  // Computed on the server; reaches HydrationInfo through the serialized RSC
  // payload, so the hydration render sees the identical value.
  const renderedAt = new Date().toISOString()
  return (
    <>
      <ClientApp />
      <HydrationInfo renderedAt={renderedAt} />
      <ServerInfo />
    </>
  )
}
