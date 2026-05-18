import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { paymentsSchema } from "@/lib/import/schemas/payments"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(paymentsSchema).min(1),
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

  // FK: operation_file_code → operation_id (within org)
  // Nota: payments no tiene FK a financial_accounts — la relación se establece
  // post-facto via ledger_movements al marcar el pago como PAID.
  //
  // adminDb justificado (caso A): el import usa RPC `bulk_import_payments`
  // que insertea con triggers de RLS estrictos. El SELECT inicial se hace
  // con admin pero SIEMPRE filtrado por org_id del user. Defense-in-depth.
  const admin = createAdminClient() as any
  const { data: ops } = await admin
    .from("operations")
    .select("id, file_code")
    .eq("org_id", orgId)
    .not("file_code", "is", null)
  const opByCode = new Map<string, string>((ops ?? []).map((o: any) => [o.file_code, o.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    const operation_id = opByCode.get(r.operation_file_code)
    if (!operation_id) {
      errors.push({ row: i + 1, error: `operation "${r.operation_file_code}" no encontrada` })
    }
    return { ...r, operation_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_payments", {
    p_org_id: orgId,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import payments error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
