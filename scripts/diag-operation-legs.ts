/**
 * Diagnóstico de tramos (operation_legs) de una o varias operaciones.
 * Read-only. Run: npx tsx scripts/diag-operation-legs.ts OP-XXXX [OP-YYYY ...]
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const ARGS = process.argv.slice(2)
if (ARGS.length === 0) {
  console.error("Uso: npx tsx scripts/diag-operation-legs.ts <file_code|opId> [...]")
  process.exit(1)
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  for (const ARG of ARGS) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ARG)
    let q = admin.from("operations").select("id, file_code, org_id, destination, created_at, updated_at")
    q = isUuid ? q.eq("id", ARG) : q.eq("file_code", ARG)
    const { data: op, error: opErr } = await q.maybeSingle()

    console.log(`\n===================== ${ARG} =====================`)
    if (opErr || !op) {
      console.error("No se encontró la operación", opErr)
      continue
    }
    console.table([op])

    const { data: legs } = await admin
      .from("operation_legs")
      .select("*")
      .eq("operation_id", (op as any).id)
      .order("order_index")

    console.log(`--- operation_legs: ${legs?.length ?? 0} ---`)
    if (legs?.length) console.table(legs)

    const { data: audits } = await admin
      .from("audit_logs")
      .select("created_at, user_email, action, details")
      .eq("entity_type", "operation")
      .eq("entity_id", (op as any).id)
      .order("created_at", { ascending: false })
      .limit(15)

    console.log(`--- audit_logs (últimos ${audits?.length ?? 0}) ---`)
    for (const a of audits || []) {
      console.log(
        (a as any).created_at,
        (a as any).action,
        (a as any).user_email,
        JSON.stringify((a as any).details?.warnings ?? [])
      )
    }
  }
})()
