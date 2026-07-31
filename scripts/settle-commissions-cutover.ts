/**
 * Cierre administrativo de comisiones viejas (VIB-94).
 * ====================================================
 *
 * CONTEXTO: una agencia que arranca a usar el módulo arrastra comisiones
 * calculadas por el sistema que, en la realidad, ya no se deben. Figuran como
 * deuda con los vendedores y ensucian todo lo que muestra "por pagar". Pedido
 * textual del cliente: "lo que necesitamos es no tener DEUDAS viejas xq no
 * existen en la realidad".
 *
 * QUÉ HACE: marca `settled_at` (cierre sin pago) en las comisiones PENDIENTES
 * cuya operación es anterior al corte. A partir de ahí no cuentan como deuda,
 * no se pueden pagar y ningún recálculo las revive. Ver la migración
 * `20260731000001_commission_records_settlement.sql`.
 *
 * QUÉ NO HACE, a propósito:
 *   - No borra nada. La historia queda consultable (`includeSettled=true`).
 *   - No toca las PAID: esas tienen un movimiento de caja atrás y siguen siendo
 *     historia real de pagos.
 *   - No toca las que tienen `amount_paid > 0`: son pagos parciales, plata que
 *     efectivamente salió. Se listan aparte para revisarlas a mano.
 *
 * CORTE: se usa `operations.operation_date`, la fecha de venta, que es el mismo
 * criterio con el que el Reporte de Comisiones imputa cada comisión a un mes.
 * `date_calculated` no sirve: un recálculo masivo la reescribe.
 *
 * SEGURIDAD:
 *   - `--org-id` obligatorio: el cierre es de UNA organización.
 *   - Dry-run por defecto; escribe solo con `--apply`.
 *   - Deja audit log por cada comisión cerrada.
 *
 * USO:
 *   npx tsx scripts/settle-commissions-cutover.ts --org-id=<uuid> --cutoff=2026-06-30
 *   npx tsx scripts/settle-commissions-cutover.ts --org-id=<uuid> --cutoff=2026-06-30 --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const orgId = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
const cutoff = args.find((a) => a.startsWith("--cutoff="))?.split("=")[1] || null
const reasonArg = args.find((a) => a.startsWith("--reason="))?.split("=")[1] || null

const PAGE = 1000

interface Row {
  id: string
  seller_id: string
  amount: number | string | null
  amount_paid: number | string | null
  status: string
  operations: {
    id: string
    file_code: string | null
    operation_date: string
    agency_id: string | null
    sale_currency: string | null
    currency: string | null
  } | null
}

function fmt(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

async function main() {
  if (!orgId) {
    console.error("Falta --org-id=<uuid>. El cierre es de una sola organización.")
    process.exit(1)
  }
  if (!cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    console.error("Falta --cutoff=YYYY-MM-DD (inclusive). Ej: --cutoff=2026-06-30")
    process.exit(1)
  }

  const reason = reasonArg || `cutover ${cutoff}`

  // El embed !inner aplica el filtro de fecha sobre la operación, que es donde
  // vive la fecha de venta.
  const rows: Row[] = []
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from("commission_records")
      .select(
        `id, seller_id, amount, amount_paid, status,
         operations!inner(id, file_code, operation_date, agency_id, sale_currency, currency)`
      )
      .eq("org_id", orgId)
      .eq("status", "PENDING")
      .is("settled_at", null)
      .lte("operations.operation_date", cutoff)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`commission_records: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as Row[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Los pagos parciales se separan: hay plata movida y cerrarlos en silencio
  // dejaría un pago sin comisión que lo explique.
  const partial = rows.filter((r) => Number(r.amount_paid ?? 0) > 0)
  const target = rows.filter((r) => Number(r.amount_paid ?? 0) <= 0)

  const byCurrency = new Map<string, { count: number; total: number }>()
  const byAgency = new Map<string, number>()
  for (const row of target) {
    const currency = row.operations?.sale_currency || row.operations?.currency || "USD"
    const acc = byCurrency.get(currency) || { count: 0, total: 0 }
    acc.count += 1
    acc.total += Number(row.amount ?? 0)
    byCurrency.set(currency, acc)

    const agency = row.operations?.agency_id || "sin-agencia"
    byAgency.set(agency, (byAgency.get(agency) || 0) + 1)
  }

  console.log(`\n${apply ? "APLICANDO" : "DRY-RUN"} — cierre de comisiones`)
  console.log(`Organización: ${orgId}`)
  console.log(`Corte: operaciones con fecha de venta <= ${cutoff}`)
  console.log(`Motivo: ${reason}\n`)

  console.log(`Comisiones pendientes alcanzadas: ${rows.length}`)
  console.log(`  A cerrar:                       ${target.length}`)
  console.log(`  Con pago parcial (SE SALTEAN):  ${partial.length}`)

  for (const [currency, acc] of Array.from(byCurrency.entries())) {
    console.log(`  Deuda que se da de baja en ${currency}: ${fmt(acc.total, currency)} (${acc.count})`)
  }
  console.log(`  Agencias alcanzadas: ${byAgency.size}`)

  if (partial.length > 0) {
    console.log(`\nRevisar a mano (tienen plata movida):`)
    for (const row of partial.slice(0, 20)) {
      const currency = row.operations?.sale_currency || row.operations?.currency || "USD"
      console.log(
        `  ${row.operations?.file_code || row.operations?.id} — ${fmt(
          Number(row.amount ?? 0),
          currency
        )}, cobrado ${fmt(Number(row.amount_paid ?? 0), currency)} (commission_record ${row.id})`
      )
    }
    if (partial.length > 20) console.log(`  ... y ${partial.length - 20} más`)
  }

  if (!apply) {
    console.log(`\nDry-run: no se escribió nada. Reejecutar con --apply para cerrar.`)
    return
  }

  const settledAt = new Date().toISOString()
  let ok = 0
  const errors: string[] = []

  for (const row of target) {
    // El guard repite las condiciones del filtro: entre el SELECT y este UPDATE
    // alguien pudo haber pagado la comisión desde la app.
    const { data, error } = await admin
      .from("commission_records")
      .update({ settled_at: settledAt, settled_reason: reason, updated_at: settledAt } as any)
      .eq("id", row.id)
      .eq("org_id", orgId)
      .eq("status", "PENDING")
      .is("settled_at", null)
      .or("amount_paid.is.null,amount_paid.eq.0")
      .select("id")

    if (error) {
      errors.push(`${row.id}: ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      errors.push(`${row.id}: cambió de estado durante la corrida, no se tocó`)
      continue
    }
    ok += 1

    // Misma tabla y forma que `logAudit()` (lib/audit.ts). No tiene columna
    // org_id, así que el tenant va en `details`.
    await admin.from("audit_log").insert({
      user_id: null,
      user_email: null,
      action: "UPDATE",
      entity_type: "commission",
      entity_id: row.id,
      details: {
        reason: "settled_cutover",
        org_id: orgId,
        cutoff,
        note: reason,
        seller_id: row.seller_id,
        operation_id: row.operations?.id ?? null,
        amount: Number(row.amount ?? 0),
      },
    } as any)
  }

  console.log(`\nCerradas: ${ok}`)
  if (errors.length > 0) {
    console.log(`Con problemas: ${errors.length}`)
    for (const e of errors.slice(0, 20)) console.log(`  ${e}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
