import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { operationsSchema } from "@/lib/import/schemas/operations"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(operationsSchema).min(1),
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

  // adminDb justificado (caso A): el import usa RPC `bulk_import_operations`
  // que insertea con triggers RLS. Los SELECT iniciales se hacen con admin
  // pero SIEMPRE filtrados por org_id del user (defense-in-depth).
  const admin = createAdminClient() as any
  const [custsRes, opsRes, sellersRes, agenciesRes] = await Promise.all([
    admin.from("customers").select("id, document_number").eq("org_id", orgId),
    admin.from("operators").select("id, name").eq("org_id", orgId),
    admin.from("users").select("id, email").eq("org_id", orgId),
    admin.from("agencies").select("id, name").eq("org_id", orgId),
  ])
  const custByDoc = new Map<string, string>((custsRes.data ?? []).map((c: any) => [c.document_number, c.id]))
  const opByName = new Map<string, string>((opsRes.data ?? []).map((o: any) => [o.name, o.id]))
  const sellerByEmail = new Map<string, string>((sellersRes.data ?? []).map((s: any) => [s.email, s.id]))
  const agencyByName = new Map<string, string>((agenciesRes.data ?? []).map((a: any) => [a.name, a.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    const customer_id = custByDoc.get(r.customer_document)
    const operator_id = opByName.get(r.operator_name)
    const seller_id = sellerByEmail.get(r.seller_email)
    const agency_id = agencyByName.get(r.agency_name)
    if (!customer_id) errors.push({ row: i + 1, error: `customer document "${r.customer_document}" no encontrado` })
    if (!operator_id) errors.push({ row: i + 1, error: `operator "${r.operator_name}" no encontrado` })
    if (!seller_id) errors.push({ row: i + 1, error: `seller email "${r.seller_email}" no encontrado` })
    if (!agency_id) errors.push({ row: i + 1, error: `agency "${r.agency_name}" no encontrada` })
    return { ...r, customer_id, operator_id, seller_id, agency_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_operations", {
    p_org_id: orgId,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import operations error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
