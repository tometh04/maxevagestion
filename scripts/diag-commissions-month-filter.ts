/**
 * Verificación READ-ONLY del filtro por mes de Comisiones.
 *
 * Compara el filtro viejo (`commission_records.date_calculated`, que reescribe
 * cada recálculo) contra el nuevo (`operations.operation_date`, la fecha de la
 * venta) para el mes que el cliente reportó como roto.
 *
 * NO ESCRIBE NADA.
 *
 * USO: npx tsx scripts/diag-commissions-month-filter.ts [YYYY-MM]
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MONTH = process.argv[2] || "2026-07"
const [Y, M] = MONTH.split("-")
const FROM = `${MONTH}-01`
const TO = `${MONTH}-${String(new Date(Date.UTC(Number(Y), Number(M), 0)).getUTCDate()).padStart(2, "0")}`

const SELECT = `
  id, org_id, amount, status, date_calculated,
  operations!inner(operation_date, status, sale_currency)
`

async function run(label: string, column: string) {
  const { data, error } = await admin
    .from("commission_records")
    .select(SELECT)
    .eq("status", "PENDING")
    .is("settled_at", null)
    .gte(column, FROM)
    .lte(column, TO)
    .limit(5000)

  if (error) {
    console.log(`${label}: ERROR → ${error.message}`)
    return
  }
  const rows = (data || []).filter((r: any) => r.operations?.status !== "CANCELLED")
  const byCur = new Map<string, number>()
  for (const r of rows as any[]) {
    const cur = r.operations?.sale_currency || "USD"
    byCur.set(cur, (byCur.get(cur) || 0) + Number(r.amount || 0))
  }
  const totals = Array.from(byCur.entries())
    .map(([c, v]) => `${c} ${v.toFixed(2)}`)
    .join("  |  ")
  console.log(`${label}: ${rows.length} comisiones — ${totals || "sin montos"}`)
}

async function main() {
  console.log(`Mes ${MONTH} (${FROM} → ${TO}), comisiones PENDING no saldadas\n`)
  await run("ANTES  filtro por date_calculated ", "date_calculated")
  await run("AHORA  filtro por operation_date  ", "operations.operation_date")
}

main()
