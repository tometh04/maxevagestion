/**
 * Diagnóstico READ-ONLY de las 5 comisiones que el cierre de VIB-94 salteó.
 * =========================================================================
 *
 * `settle-commissions-cutover.ts` saltea a propósito las comisiones con
 * `amount_paid > 0`: hay plata movida y cerrarlas en silencio dejaría un pago
 * sin comisión que lo explique. El cliente respondió "dejalas todas saldadas y
 * listo", así que antes de escribir nada hay que ver qué son exactamente:
 * cuánto se pagó, si hay ledger atrás y si alguna quedó sobrepagada.
 *
 * NO ESCRIBE NADA.
 *
 * USO: npx tsx scripts/diag-vib94-comisiones-con-pago.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FILE_CODES = [
  "OP-20260520-C00DE4FF",
  "OP-20260509-789DFB3E",
  "OP-20260507-321E7059",
  "OP-20260515-F5B08BDC",
  "OP-20260513-8006F465",
]

function n(v: unknown): number {
  return Number(v ?? 0)
}

async function main() {
  const { data: ops, error: opsError } = await admin
    .from("operations")
    .select("id, file_code, operation_date, agency_id, org_id, sale_currency, currency, status")
    .in("file_code", FILE_CODES)

  if (opsError) throw new Error(`operations: ${opsError.message}`)
  console.log(`Operaciones encontradas: ${ops?.length ?? 0} de ${FILE_CODES.length}`)

  const faltantes = FILE_CODES.filter((f) => !(ops || []).some((o: any) => o.file_code === f))
  if (faltantes.length > 0) console.log(`NO encontradas por file_code: ${faltantes.join(", ")}`)
  if (!ops || ops.length === 0) return

  const opIds = ops.map((o: any) => o.id)

  const { data: recs, error: recsError } = await admin
    .from("commission_records")
    .select(
      "id, org_id, operation_id, seller_id, amount, amount_paid, status, settled_at, settled_reason, date_calculated, updated_at"
    )
    .in("operation_id", opIds)

  if (recsError) throw new Error(`commission_records: ${recsError.message}`)

  const sellerIds = Array.from(new Set((recs || []).map((r: any) => r.seller_id).filter(Boolean)))
  const { data: sellers } = await admin.from("users").select("id, name").in("id", sellerIds)
  const sellerName = new Map((sellers || []).map((u: any) => [u.id, u.name]))

  // Ledger COMMISSION: es el respaldo de que la plata salió de una cuenta.
  const { data: ledger } = await admin
    .from("ledger_movements")
    .select("id, operation_id, seller_id, type, currency, amount_original, movement_date, concept, account_id")
    .in("operation_id", opIds)
    .eq("type", "COMMISSION")

  for (const op of ops as any[]) {
    const opRecs = (recs || []).filter((r: any) => r.operation_id === op.id)
    const opLedger = (ledger || []).filter((l: any) => l.operation_id === op.id)

    console.log(`\n${"=".repeat(70)}`)
    console.log(`${op.file_code} · venta ${op.operation_date} · ${op.sale_currency || op.currency} · op ${op.status}`)
    console.log(`  org ${op.org_id} · agencia ${op.agency_id ?? "sin agencia"}`)

    for (const r of opRecs) {
      const amount = n(r.amount)
      const paid = n(r.amount_paid)
      const diff = paid - amount
      const marca =
        Math.abs(diff) < 0.01 ? "PAGADA AL 100%" : diff > 0 ? `SOBREPAGADA por ${diff.toFixed(2)}` : `parcial, falta ${(-diff).toFixed(2)}`
      console.log(`  - commission_record ${r.id}`)
      console.log(`    vendedor: ${sellerName.get(r.seller_id) || r.seller_id}`)
      console.log(`    amount ${amount.toFixed(2)} · amount_paid ${paid.toFixed(2)} → ${marca}`)
      console.log(`    status ${r.status} · settled_at ${r.settled_at ?? "null"}`)
      console.log(`    calculada ${r.date_calculated ?? "?"} · actualizada ${r.updated_at ?? "?"}`)
    }
    if (opRecs.length === 0) console.log(`  (sin commission_records)`)

    if (opLedger.length > 0) {
      console.log(`  Ledger COMMISSION (plata que salió):`)
      for (const l of opLedger) {
        console.log(
          `    ${l.movement_date?.slice(0, 10)} · ${l.currency} ${n(l.amount_original).toFixed(2)} · ${l.concept ?? ""}`
        )
      }
    } else {
      console.log(`  Ledger COMMISSION: NINGUNO (no hay respaldo de pago en el ledger)`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
