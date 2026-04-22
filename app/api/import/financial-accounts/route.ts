import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { financialAccountsSchema } from "@/lib/import/schemas/financial-accounts"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(financialAccountsSchema).min(1),
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

  // FK resolution: agency_name → agency_id (within org)
  const admin = createAdminClient() as any
  const { data: agencies } = await admin.from("agencies").select("id, name").eq("org_id", orgId)
  const byName = new Map<string, string>((agencies ?? []).map((a: any) => [a.name, a.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    let agency_id: string | null = null
    if (r.agency_name && r.agency_name !== "") {
      agency_id = byName.get(r.agency_name) ?? null
      if (!agency_id) errors.push({ row: i + 1, error: `agency "${r.agency_name}" no encontrada` })
    }
    return { ...r, agency_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_financial_accounts", {
    p_org_id: orgId,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import financial_accounts error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
