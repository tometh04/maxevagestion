import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { createServerClient } from "@/lib/supabase/server"
import { EveConnectionClient } from "@/components/eve/eve-connection-client"
import { eveGetAgencia } from "@/lib/integrations/eve/client"
import type { EveIntegrationConfig } from "@/lib/integrations/eve/types"

export const dynamic = "force-dynamic"

export default async function EveStatusPage() {
  const { user } = await getCurrentUser()

  // Guard de permiso: solo usuarios con acceso al módulo 'eve'
  if (!canPerformAction(user, "eve", "read")) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()

  // Cross-tenant fix: filtro explícito por org_id
  const { data: integ } = await (supabase
    .from("org_integrations") as any)
    .select("is_active, config, webhook_token")
    .eq("org_id", user.org_id)
    .eq("integration", "eve")
    .maybeSingle()

  // Si no está conectada, pasamos initial mínimo
  if (!integ) {
    return (
      <EveConnectionClient
        canWrite={canPerformAction(user, "eve", "write")}
        initial={{ connected: false }}
      />
    )
  }

  const webhookConfigured = !!integ.webhook_token && integ.is_active === true

  // Intentar obtener estado de Eve (toleramos que esté caído)
  try {
    const { agencia, canales } = await eveGetAgencia(user.org_id!)
    return (
      <EveConnectionClient
        canWrite={canPerformAction(user, "eve", "write")}
        initial={{ connected: true, webhook_configured: webhookConfigured, agencia, canales }}
      />
    )
  } catch {
    return (
      <EveConnectionClient
        canWrite={canPerformAction(user, "eve", "write")}
        initial={{
          connected: true,
          webhook_configured: webhookConfigured,
          agencia: null,
          canales: [],
          error: "eve_unreachable",
        }}
      />
    )
  }
}
