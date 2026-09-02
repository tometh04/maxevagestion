import { notFound, redirect } from "next/navigation"

import { AgenteBlancoInbox } from "@/components/conversations/agente-blanco-inbox"
import { assertAddonEnabledPage } from "@/lib/addons/guard"
import { getAgenteBlancoClientId } from "@/lib/agente-blanco/config"
import {
  getAgenteBlancoNetworks,
  getAgenteBlancoOrgSlug,
} from "@/lib/agente-blanco/org"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

export const dynamic = "force-dynamic"

/**
 * Conversaciones — bandeja de Instagram/WhatsApp de Agente Blanco embebida.
 *
 * La sección solo existe si la org tiene `agente_blanco_org_slug` y el usuario
 * está en el soft-launch. Si no, no hay cartel ni pantalla vacía: 404, igual
 * que el ítem del sidebar que tampoco aparece.
 */
export default async function ConversacionesPage() {
  const { user, supabase, matrix, agencyIds } = await getRequestPermissions()

  if (!canPerformAction(user, "leads", "read", matrix ?? undefined)) {
    redirect("/dashboard")
  }

  // Complemento contratado. Mismo 404 que una org sin slug: si no lo tiene, la
  // sección no existe para ella. Va después del permiso, nunca en su lugar.
  await assertAddonEnabledPage(supabase, user.org_id, "agente_blanco")

  const [orgSlug, networks] = await Promise.all([
    getAgenteBlancoOrgSlug(supabase, user.org_id),
    getAgenteBlancoNetworks(supabase, user.org_id, agencyIds),
  ])
  if (!orgSlug) notFound()

  return (
    // Altura fija en vez de `data-height="fill"`: la bandeja es una app con
    // scroll propio y el shell del dashboard ya tiene header + contenedor
    // scrolleable, así que sin altura acotada el iframe colapsa.
    <div className="flex h-[calc(100dvh-var(--header-height,3.5rem)-2rem)] min-h-[520px] flex-col md:h-[calc(100dvh-var(--header-height,3.5rem)-3rem)]">
      {/* Sin encabezado visible: la bandeja ya se presenta sola y el título
          comía alto que acá vale más que en cualquier otra pantalla. Queda
          para lectores de pantalla, que sí necesitan el h1. */}
      <h1 className="sr-only">Agente Blanco</h1>
      <AgenteBlancoInbox
        clientId={getAgenteBlancoClientId()}
        orgSlug={orgSlug}
        networks={networks.map((network) => ({
          agencyId: network.agencyId,
          agencyName: network.agencyName,
        }))}
      />
    </div>
  )
}
