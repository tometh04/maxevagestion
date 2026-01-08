import { Metadata } from "next"
import { IntegrationsPageClient } from "@/components/integrations/integrations-page-client"

export const metadata: Metadata = {
  title: "Integraciones - MAXEVA GESTION",
  description: "Gestiona las integraciones con servicios externos",
}

export default function IntegrationsPage() {
  return (
    <div className="container mx-auto py-6">
      <IntegrationsPageClient />
    </div>
  )
}
