import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { customersSchema } from "@/lib/import/schemas/customers"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(customersSchema).min(1),
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

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_customers", {
    p_org_id: orgId,
    p_rows: parsed.data.rows,
  })
  if (error) {
    console.error("import customers error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
