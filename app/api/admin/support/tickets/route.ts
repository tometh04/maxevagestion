import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createAdminClient()
  const url = new URL(req.url)
  const status = url.searchParams.get("status")

  let query = (admin as any)
    .from("support_tickets")
    .select(`
      id, subject, description, status, created_at, updated_at,
      user_id, org_id, conversation_id
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  const { data: tickets, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with user email and org name
  const userIds = Array.from(new Set((tickets || []).map((t: any) => t.user_id)))
  const orgIds = Array.from(new Set((tickets || []).filter((t: any) => t.org_id).map((t: any) => t.org_id)))

  let usersMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: users } = await (admin as any)
      .from("users")
      .select("auth_id, email")
      .in("auth_id", userIds)
    if (users) {
      usersMap = Object.fromEntries(users.map((u: any) => [u.auth_id, u.email]))
    }
  }

  let orgsMap: Record<string, string> = {}
  if (orgIds.length > 0) {
    const { data: orgs } = await (admin as any)
      .from("organizations")
      .select("id, name")
      .in("id", orgIds)
    if (orgs) {
      orgsMap = Object.fromEntries(orgs.map((o: any) => [o.id, o.name]))
    }
  }

  const enriched = (tickets || []).map((t: any) => ({
    ...t,
    user_email: usersMap[t.user_id] || t.user_id,
    org_name: t.org_id ? (orgsMap[t.org_id] || t.org_id) : null,
  }))

  return NextResponse.json({ tickets: enriched })
}

export async function PATCH(req: NextRequest) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, status } = await req.json()
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 })
  }

  const validStatuses = ["open", "in_progress", "resolved", "closed"]
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const adminPatch = createAdminClient()
  const { error } = await (adminPatch as any)
    .from("support_tickets")
    .update({ status })
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
