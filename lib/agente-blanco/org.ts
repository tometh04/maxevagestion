import type { SupabaseClient } from "@supabase/supabase-js"

import {
  isValidAgenteBlancoNetwork,
  isValidAgenteBlancoOrgSlug,
} from "@/lib/agente-blanco/config"
import type { Database } from "@/lib/supabase/types"

/**
 * Slug de la empresa en Agente Blanco, o null si esta org no tiene el embebido.
 *
 * Siempre con el client scoped al request y filtrando por `id = orgId`: el slug
 * es lo que despues viaja en el claim `org` del JWT, asi que leerlo de otra org
 * seria abrirle a alguien la bandeja de otra empresa.
 *
 * Devuelve null (y loguea) si el valor guardado no respeta el formato, para no
 * firmar un token con basura en el claim.
 */
export async function getAgenteBlancoOrgSlug(
  supabase: SupabaseClient<Database>,
  orgId: string | null | undefined
): Promise<string | null> {
  if (!orgId) return null

  const { data, error } = await (supabase.from("organizations") as any)
    .select("agente_blanco_org_slug")
    .eq("id", orgId)
    .maybeSingle()

  if (error) {
    console.error("[agente-blanco] no se pudo leer el slug de la org", {
      orgId,
      cause: error.message,
    })
    return null
  }

  const slug = data?.agente_blanco_org_slug ?? null
  if (slug === null) return null

  if (!isValidAgenteBlancoOrgSlug(slug)) {
    console.error("[agente-blanco] slug con formato invalido en organizations", { orgId })
    return null
  }

  return slug
}

/**
 * Una red conectada de Agente Blanco (la "sucursal"), mapeada a la agencia
 * que la usa.
 */
export interface AgenteBlancoNetwork {
  agencyId: string
  agencyName: string
  network: string
}

/**
 * Redes de Agente Blanco de las agencias que el usuario puede ver, ordenadas
 * por nombre.
 *
 * Doble filtro a proposito: por `org_id` y por las agencias que resolvio
 * `getUserAgencyIds`. La lista es la que despues valida que el `agencyId` que
 * llega por query string sea realmente del usuario.
 */
export async function getAgenteBlancoNetworks(
  supabase: SupabaseClient<Database>,
  orgId: string | null | undefined,
  agencyIds: string[]
): Promise<AgenteBlancoNetwork[]> {
  if (!orgId || agencyIds.length === 0) return []

  const { data, error } = await (supabase.from("agencies") as any)
    .select("id, name, agente_blanco_network")
    .eq("org_id", orgId)
    .in("id", agencyIds)
    .not("agente_blanco_network", "is", null)
    .order("name")

  if (error) {
    console.error("[agente-blanco] no se pudieron leer las redes de las agencias", {
      orgId,
      cause: error.message,
    })
    return []
  }

  return (data ?? [])
    .filter((row: any) => {
      if (isValidAgenteBlancoNetwork(row.agente_blanco_network)) return true
      console.error("[agente-blanco] red con formato invalido en agencies", {
        orgId,
        agencyId: row.id,
      })
      return false
    })
    .map((row: any) => ({
      agencyId: row.id as string,
      agencyName: (row.name as string) ?? "Sin nombre",
      network: row.agente_blanco_network as string,
    }))
}
