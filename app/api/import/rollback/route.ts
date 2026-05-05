/**
 * POST /api/import/rollback
 *
 * Pendientes 3.2 (UX Import) — endpoint para deshacer un import recién
 * ejecutado. El cliente manda el `rollbackLog` que recibió en el
 * `ImportResult` de la última corrida; nosotros llamamos `executeRollback`
 * con el admin client para borrar las filas insertadas.
 *
 * Auth:
 *  - SUPER_ADMIN o ADMIN
 *  - El admin client respeta org_id implícito por RLS en cada DELETE
 *    (no podés rollbackear filas de otra org aunque mandes los IDs)
 *
 * Body:
 *  { entries: Array<{ table: string; id: string }> }
 *
 * Response:
 *  { deleted: number; failed: number; failures: Array<{ table, id, error }> }
 */
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { executeRollback } from "@/lib/import/executor"
import { z } from "zod"

const ALLOWED_TABLES = new Set([
  "customers",
  "operators",
  "operations",
  "operation_customers",
  "operation_operators",
  "payments",
  "cash_movements",
  "users",
  "agencies",
  "financial_accounts",
])

const bodySchema = z.object({
  entries: z
    .array(
      z.object({
        table: z.string().min(1),
        id: z.string().uuid(),
      })
    )
    .min(1)
    .max(2000),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", details: parsed.error.issues },
      { status: 400 }
    )
  }

  // Whitelist de tablas — un body con `table: "users"` mal formado no
  // puede borrar filas de otras tablas porque el supabase client no las
  // alcanzaría, pero validar acá da feedback rápido al user.
  const invalid = parsed.data.entries.filter((e) => !ALLOWED_TABLES.has(e.table))
  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error: `Tablas no permitidas para rollback: ${Array.from(
          new Set(invalid.map((e) => e.table))
        ).join(", ")}`,
      },
      { status: 400 }
    )
  }

  const supabase = await createServerClient()
  const result = await executeRollback(supabase, parsed.data.entries)
  return NextResponse.json(result)
}
