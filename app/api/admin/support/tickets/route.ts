import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"

export const dynamic = "force-dynamic"

const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"]

// Orden por prioridad (urgent → low) y luego por fecha, para que funcione como
// backlog priorizado y no como inbox plano. priority es text, así que ordenamos
// por rank numérico en JS.
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

/** Sanitiza el texto de búsqueda: saca los caracteres que rompen la sintaxis de `or` de PostgREST. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()]/g, " ").trim()
}

async function requirePlatformAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  return isPlatformAdmin(supabase, user.id)
}

export async function GET(req: NextRequest) {
  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createAdminClient()
  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const category = url.searchParams.get("category")
  const priority = url.searchParams.get("priority")
  const org = url.searchParams.get("org")
  const includeClosed = url.searchParams.get("includeClosed") === "true"
  const rawQ = url.searchParams.get("q") || ""
  const q = sanitizeSearch(rawQ)

  let query = (admin as any)
    .from("support_tickets")
    .select(`
      id, subject, description, status, created_at, updated_at,
      user_id, org_id, conversation_id,
      category, severity, priority, ai_rationale,
      linear_issue_url, linear_identifier
    `)
    .limit(500)

  if (status && status !== "all") {
    query = query.eq("status", status)
  } else if (!includeClosed) {
    // Por defecto el backlog no muestra cerrados (se pueden mostrar con el toggle).
    query = query.neq("status", "closed")
  }
  if (category && category !== "all") query = query.eq("category", category)
  if (priority && priority !== "all") query = query.eq("priority", priority)
  if (org && org !== "all") query = query.eq("org_id", org)

  // Búsqueda por texto: asunto/descripción en DB + emails que matcheen
  // (resolviendo primero los auth_id de esos usuarios).
  if (q) {
    const { data: matchingUsers } = await (admin as any)
      .from("users")
      .select("auth_id")
      .ilike("email", `%${q}%`)
      .limit(50)
    const authIds: string[] = (matchingUsers || [])
      .map((u: any) => u.auth_id)
      .filter(Boolean)

    const orParts = [`subject.ilike.%${q}%`, `description.ilike.%${q}%`]
    if (authIds.length > 0) orParts.push(`user_id.in.(${authIds.join(",")})`)
    query = query.or(orParts.join(","))
  }

  const { data: rawTickets, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const tickets = (rawTickets || []).sort((a: any, b: any) => {
    const pa = PRIORITY_RANK[a.priority] ?? 2
    const pb = PRIORITY_RANK[b.priority] ?? 2
    if (pa !== pb) return pa - pb
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  // Enrich with user email and org name
  const userIds = Array.from(new Set(tickets.map((t: any) => t.user_id)))
  const orgIds = Array.from(new Set(tickets.filter((t: any) => t.org_id).map((t: any) => t.org_id)))

  let usersMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: users } = await (admin as any)
      .from("users")
      .select("auth_id, email")
      .in("auth_id", userIds)
    if (users) usersMap = Object.fromEntries(users.map((u: any) => [u.auth_id, u.email]))
  }

  let orgsMap: Record<string, string> = {}
  if (orgIds.length > 0) {
    const { data: orgs } = await (admin as any)
      .from("organizations")
      .select("id, name")
      .in("id", orgIds)
    if (orgs) orgsMap = Object.fromEntries(orgs.map((o: any) => [o.id, o.name]))
  }

  const enriched = tickets.map((t: any) => ({
    ...t,
    user_email: usersMap[t.user_id] || t.user_id,
    org_name: t.org_id ? (orgsMap[t.org_id] || t.org_id) : null,
  }))

  // Contadores globales (sin filtros) para las tarjetas de arriba.
  const { data: allForCounts } = await (admin as any)
    .from("support_tickets")
    .select("status, priority")
    .limit(5000)
  const counts = {
    total: (allForCounts || []).length,
    open: (allForCounts || []).filter((t: any) => t.status === "open").length,
    in_progress: (allForCounts || []).filter((t: any) => t.status === "in_progress").length,
    urgent: (allForCounts || []).filter(
      (t: any) => t.priority === "urgent" && t.status !== "closed" && t.status !== "resolved",
    ).length,
  }

  // Lista de organizaciones con tickets, para el filtro por agencia.
  const { data: allOrgRows } = await (admin as any)
    .from("support_tickets")
    .select("org_id")
    .not("org_id", "is", null)
    .limit(5000)
  const distinctOrgIds = Array.from(new Set((allOrgRows || []).map((r: any) => r.org_id)))
  let orgOptions: { id: string; name: string }[] = []
  if (distinctOrgIds.length > 0) {
    const { data: orgs } = await (admin as any)
      .from("organizations")
      .select("id, name")
      .in("id", distinctOrgIds)
    orgOptions = (orgs || []).sort((a: any, b: any) =>
      (a.name || "").localeCompare(b.name || ""),
    )
  }

  return NextResponse.json({ tickets: enriched, counts, orgs: orgOptions })
}

/**
 * PATCH — cambia el estado de uno (`id`) o varios (`ids`) tickets.
 */
export async function PATCH(req: NextRequest) {
  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, ids, status } = await req.json()
  const targetIds: string[] = Array.isArray(ids) ? ids : id ? [id] : []

  if (targetIds.length === 0 || !status) {
    return NextResponse.json({ error: "id/ids and status required" }, { status: 400 })
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await (admin as any)
    .from("support_tickets")
    .update({ status })
    .in("id", targetIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: targetIds.length })
}

/**
 * DELETE — borra uno (`id`) o varios (`ids`) tickets junto con sus respuestas
 * (CASCADE). NO toca el issue de Linear: queda vivo para el equipo de dev.
 */
export async function DELETE(req: NextRequest) {
  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, ids } = await req.json()
  const targetIds: string[] = Array.isArray(ids) ? ids : id ? [id] : []

  if (targetIds.length === 0) {
    return NextResponse.json({ error: "id/ids required" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await (admin as any)
    .from("support_tickets")
    .delete()
    .in("id", targetIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, deleted: targetIds.length })
}
