import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { cashMovementsSchema } from "@/lib/import/schemas/cash-movements"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(cashMovementsSchema).min(1),
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

  // FK resolution: account_name → financial_account_id
  // adminDb justificado (caso A): RPC `bulk_import_cash_movements` insertea
  // con triggers RLS. SELECT pre-FK filtrado por org_id (defense-in-depth).
  const admin = createAdminClient() as any
  const { data: accounts } = await admin.from("financial_accounts").select("id, name").eq("org_id", orgId)
  const byName = new Map<string, string>((accounts ?? []).map((a: any) => [a.name, a.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    const financial_account_id = byName.get(r.account_name)
    if (!financial_account_id) {
      errors.push({ row: i + 1, error: `cuenta "${r.account_name}" no encontrada` })
    }
    return { ...r, financial_account_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  // NOTE: bulk_import_cash_movements takes 3 params: (p_org_id, p_user_id, p_rows)
  const { data, error } = await (supabase.rpc as any)("bulk_import_cash_movements", {
    p_org_id: orgId,
    p_user_id: user.id,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import cash_movements error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
