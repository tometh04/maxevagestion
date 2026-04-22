import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { usersSchema } from "@/lib/import/schemas/users"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(usersSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = user.org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const admin = createAdminClient() as any

  // FK: agency_name → agency_id
  const { data: agencies } = await admin.from("agencies").select("id, name").eq("org_id", orgId)
  const agencyByName = new Map<string, string>((agencies ?? []).map((a: any) => [a.name, a.id]))

  // Crear auth.users para cada row (manda email de invitación con link para setear password)
  const inviteResults: { email: string; auth_id?: string; error?: string }[] = []
  for (const row of parsed.data.rows) {
    try {
      const { data: inviteRes, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(row.email, {
        data: { full_name: row.name, invited_org_id: orgId },
      })
      if (inviteErr) {
        inviteResults.push({ email: row.email, error: inviteErr.message })
      } else {
        inviteResults.push({ email: row.email, auth_id: inviteRes.user?.id })
      }
    } catch (e: any) {
      inviteResults.push({ email: row.email, error: e.message })
    }
  }

  const rowsWithAuth = parsed.data.rows.flatMap((r, i) => {
    const inv = inviteResults[i]
    if (!inv.auth_id) return [] // skip rows whose invite failed
    const agency_id =
      r.agency_name && r.agency_name !== ""
        ? agencyByName.get(r.agency_name) ?? null
        : null
    return [{
      ...r,
      auth_id: inv.auth_id,
      agency_id,
    }]
  })

  if (rowsWithAuth.length === 0) {
    return NextResponse.json({
      error: "Ninguna invitación fue enviada",
      invites: inviteResults,
    }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_users", {
    p_org_id: orgId,
    p_rows: rowsWithAuth,
  })
  if (error) {
    console.error("import users error", error)
    return NextResponse.json({ error: error.message, invites: inviteResults }, { status: 500 })
  }

  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    invites_sent: inviteResults.filter((i) => i.auth_id).length,
    invites_failed: inviteResults.filter((i) => i.error),
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
