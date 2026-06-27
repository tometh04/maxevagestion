import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { createServerClient } from "@/lib/supabase/server"
import { ChannelEditor } from "@/components/eve/channel-editor"
import { eveGetAgencia } from "@/lib/integrations/eve/client"
import type { EveIntegrationConfig } from "@/lib/integrations/eve/types"
import type { EveCanal } from "@/lib/integrations/eve/client"

export const dynamic = "force-dynamic"

export default async function EveChannelsPage() {
  const { user } = await getCurrentUser()

  // Guard de permiso
  if (!canPerformAction(user, "eve", "read")) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()

  // Cross-tenant fix: verificar si está conectada
  const { data: integ } = await (supabase
    .from("org_integrations") as any)
    .select("config")
    .eq("org_id", user.org_id)
    .eq("integration", "eve")
    .maybeSingle()

  const connected = !!(integ?.config as EveIntegrationConfig | null)?.eve_agencia_id

  let initialChannels: EveCanal[] = []
  if (connected) {
    try {
      const { canales } = await eveGetAgencia(user.org_id!)
      initialChannels = canales
    } catch {
      // Eve caído: mostramos lista vacía, el usuario puede recargar
    }
  }

  return (
    <ChannelEditor
      connected={connected}
      canWrite={canPerformAction(user, "eve", "write")}
      initialChannels={initialChannels}
    />
  )
}
