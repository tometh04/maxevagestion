import { NextResponse } from "next/server"

import {
  isValidAgenteBlancoNetwork,
  isValidAgenteBlancoOrgSlug,
} from "@/lib/agente-blanco/config"
import { getCurrentUser } from "@/lib/auth"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

/**
 * PATCH /api/admin/orgs/[id]/agente-blanco
 *   { slug?: string | null, networks?: { [agencyId]: string | null } }
 *
 * Setea (o borra) el identificador de la empresa en Agente Blanco y, por
 * agencia, la red conectada (cuenta de Instagram o número de WhatsApp) que
 * elige qué bandeja abrir. El slug es el switch de la sección para ese tenant.
 *
 * SOLO platform admin, a propósito: este valor termina en el claim `org` del
 * JWT que Vibook firma, y Agente Blanco abre la bandeja que ese claim indique.
 * Si un admin de tenant pudiera escribirlo, se auto-asignaría la bandeja de
 * cualquier otra empresa habilitada. Por eso tampoco hay endpoint de tenant.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const hasSlug = "slug" in body
  const hasNetworks = "networks" in body
  if (!hasSlug && !hasNetworks) {
    return NextResponse.json({ error: "No hay nada que actualizar" }, { status: 400 })
  }

  let slug: string | null = null
  if (hasSlug) {
    const raw = body.slug
    if (raw !== null && typeof raw !== "string") {
      return NextResponse.json({ error: "slug debe ser string o null" }, { status: 400 })
    }
    const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : null
    slug = trimmed ? trimmed : null

    if (slug !== null && !isValidAgenteBlancoOrgSlug(slug)) {
      return NextResponse.json(
        {
          error:
            "Slug inválido. Solo minúsculas, números y guiones internos (ej. lozada-viajes).",
        },
        { status: 400 },
      )
    }
  }

  // Redes por agencia. Acepta el id de la red, el usuario de Instagram o el
  // número de WhatsApp, tal como lo tenga cargado Agente Blanco.
  const networkPatch = new Map<string, string | null>()
  if (hasNetworks) {
    const rawNetworks = body.networks
    if (typeof rawNetworks !== "object" || rawNetworks === null || Array.isArray(rawNetworks)) {
      return NextResponse.json({ error: "networks debe ser un objeto" }, { status: 400 })
    }
    for (const [agencyId, value] of Object.entries(rawNetworks as Record<string, unknown>)) {
      if (value !== null && typeof value !== "string") {
        return NextResponse.json(
          { error: `networks.${agencyId} debe ser string o null` },
          { status: 400 },
        )
      }
      const network = typeof value === "string" && value.trim() ? value.trim() : null
      if (network !== null && !isValidAgenteBlancoNetwork(network)) {
        return NextResponse.json(
          { error: "Red inválida. Sin espacios: id, usuario de Instagram o teléfono." },
          { status: 400 },
        )
      }
      networkPatch.set(agencyId, network)
    }
  }

  const admin = createAdminClient()

  const { data: org } = await (admin.from("organizations") as any)
    .select("id, agente_blanco_org_slug")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const beforeSlug = org.agente_blanco_org_slug ?? null

  // Las agencias tienen que ser de ESTA org: el id viene del body y sin este
  // chequeo se podria escribir la red de una agencia de otro tenant.
  const beforeNetworks: Record<string, string | null> = {}
  if (networkPatch.size > 0) {
    const agencyIds = Array.from(networkPatch.keys())
    const { data: agencies, error: agenciesError } = await (admin.from("agencies") as any)
      .select("id, agente_blanco_network")
      .eq("org_id", orgId)
      .in("id", agencyIds)

    if (agenciesError) {
      return NextResponse.json({ error: agenciesError.message }, { status: 500 })
    }

    const found = new Map<string, string | null>(
      (agencies ?? []).map((a: any) => [a.id as string, a.agente_blanco_network ?? null]),
    )
    const foreign = agencyIds.filter((id) => !found.has(id))
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: "Alguna agencia no pertenece a esta organización" },
        { status: 404 },
      )
    }

    for (const [agencyId, network] of Array.from(networkPatch.entries())) {
      const previous = found.get(agencyId) ?? null
      if (previous === network) continue

      const { error } = await (admin.from("agencies") as any)
        .update({ agente_blanco_network: network })
        .eq("id", agencyId)
        .eq("org_id", orgId)

      if (error) {
        // Índice único parcial: una red pertenece a una sola agencia.
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "Esa red ya está asignada a otra agencia" },
            { status: 409 },
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      beforeNetworks[agencyId] = previous
    }
  }

  const slugChanged = hasSlug && beforeSlug !== slug
  if (slugChanged) {
    const { error } = await (admin.from("organizations") as any)
      .update({ agente_blanco_org_slug: slug })
      .eq("id", orgId)

    if (error) {
      // Índice único parcial: el mismo slug no puede apuntar a dos tenants.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ese slug ya está asignado a otra organización" },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const changedNetworks = Object.keys(beforeNetworks)
  if (slugChanged || changedNetworks.length > 0) {
    logSecurityEvent({
      eventType: "ORG_AGENTE_BLANCO_UPDATED",
      // Cambia qué bandeja externa ve un tenant entero: no es un INFO más.
      severity: "WARN",
      actorUserId: user.id,
      actorAuthId: (user as any).auth_id,
      targetOrgId: orgId,
      targetEntity: "organizations",
      targetEntityId: orgId,
      requestPath: req.url,
      details: {
        slug: slugChanged ? { before: beforeSlug, after: slug } : undefined,
        networks: changedNetworks.length
          ? changedNetworks.map((agencyId) => ({
              agencyId,
              before: beforeNetworks[agencyId],
              after: networkPatch.get(agencyId) ?? null,
            }))
          : undefined,
      },
    })
  }

  return NextResponse.json({ ok: true, slug: hasSlug ? slug : beforeSlug })
}
