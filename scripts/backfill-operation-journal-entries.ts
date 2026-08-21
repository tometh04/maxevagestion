/**
 * Backfill de asientos de venta, costo y comisión — VIB-134/B0.
 *
 * CONTEXTO
 * --------
 * El motor de asientos nunca produjo un asiento de venta, costo ni comisión:
 * primero porque exigía una cuenta financiera por línea (fix B0, commit
 * 0e0204bf) y después porque no pasaba tipo de cambio en las operaciones en
 * USD (fix 80b6bd6a). Recién a partir de este último las operaciones que se
 * confirman generan sus asientos.
 *
 * Este script cubre el hueco hacia atrás: las operaciones ya confirmadas nunca
 * van a volver a transicionar, así que sin backfill el Libro Mayor arranca
 * vacío y cualquier reporte contable muestra una foto parcial.
 *
 * POR QUÉ ES SEGURO
 * -----------------
 * Las líneas de asiento van con `account_id = null` y `affects_balance = false`:
 * no mueven el saldo de ninguna cuenta financiera y quedan fuera de Ganancias y
 * de la posición mensual, que filtran por `account_id IS NOT NULL`. O sea que
 * NO cambia ni un número de lo que las agencias ven hoy — agrega una capa
 * contable que hoy no existe.
 *
 * Tampoco marca comisiones como pagadas: el guard de `createLedgerMovement`
 * exige que el movimiento tenga cuenta financiera para eso, y estas líneas no
 * la tienen (verificado en producción antes de correr esto).
 *
 * TIPO DE CAMBIO
 * --------------
 * `exchange_rates` solo tiene tasas desde 2026-04-23, y hay operaciones desde
 * 2024. Prioridad, en orden:
 *
 *   1. La tasa de `exchange_rates` vigente a la fecha de la operación. Es el
 *      mismo criterio que usan los asientos nuevos (la fuente que "valúa", ver
 *      docs/finance/TIPO-DE-CAMBIO-FUENTES.md), así que histórico y nuevo
 *      quedan consistentes.
 *   2. El TC real de la propia operación: el del primer movimiento de su
 *      ledger. Es lo que la agencia efectivamente transaccionó.
 *   3. Si no hay ninguno, la operación se SALTEA y se reporta. Nunca se inventa
 *      un TC ni se estira el más viejo hacia atrás: valuar una operación de
 *      2024 al dólar de 2026 la infla varias veces.
 *
 * Las operaciones en ARS no necesitan TC.
 *
 * IDEMPOTENCIA
 * ------------
 * La dan las propias funciones (`hasExistingJournalEntry` por origen y el
 * chequeo del asiento de costo). Volver a correrlo no duplica nada.
 *
 *   Dry-run (default):  npx tsx scripts/backfill-operation-journal-entries.ts
 *   Una agencia:        ... --org "Milla Cero"
 *   De a poco:          ... --limit 25
 *   Aplicar:            ... --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const argValue = (name: string): string | null => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const ORG_FILTER = argValue("--org")
const LIMIT = Number(argValue("--limit") ?? 0) || null

const ESTADOS_CONFIRMADOS = ["CONFIRMED", "CLOSED", "TRAVELLING", "TRAVELLED"]

type Rate = { rate_date: string; rate: number }

function money(n: number, currency = "ARS") {
  return `${currency} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Trae todas las filas de un `.in(col, ids)` paginando de verdad.
 *
 * PostgREST corta en 1000 filas por defecto y NO avisa: la respuesta llega
 * truncada y parece completa. Acá eso significaba dar por hecho que una
 * operación no tenía tipo de cambio propio y saltearla.
 */
async function fetchAllIn(
  table: string,
  columns: string,
  col: string,
  ids: string[],
  tune?: (q: any) => any
): Promise<any[]> {
  const out: any[] = []
  const PAGE = 1000
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    for (let from = 0; ; from += PAGE) {
      let q: any = (admin.from(table) as any).select(columns).in(col, chunk)
      if (tune) q = tune(q)
      const { data, error } = await q.range(from, from + PAGE - 1)
      if (error) throw new Error(`${table}: ${error.message}`)
      if (!data || data.length === 0) break
      out.push(...data)
      if (data.length < PAGE) break
    }
  }
  return out
}

/** Tasa vigente a `date`: la más reciente con fecha <= date. */
function rateAsOf(rates: Rate[], date: string): number | null {
  let found: number | null = null
  for (const r of rates) {
    if (r.rate_date <= date) found = r.rate
    else break
  }
  return found
}

async function main() {
  console.log("=".repeat(78))
  console.log(`BACKFILL de asientos de operaciones — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  if (ORG_FILTER) console.log(`Agencia: ${ORG_FILTER}`)
  if (LIMIT) console.log(`Tope: ${LIMIT} operaciones`)
  console.log("=".repeat(78))

  // ---------------------------------------------------------------- tasas
  const { data: rateRows, error: rateError } = await admin
    .from("exchange_rates")
    .select("rate_date, rate")
    .eq("from_currency", "USD")
    .eq("to_currency", "ARS")
    .order("rate_date", { ascending: true })

  if (rateError) {
    console.error("Error leyendo exchange_rates:", rateError.message)
    process.exit(1)
  }
  const rates: Rate[] = (rateRows ?? []).map((r: any) => ({
    rate_date: r.rate_date,
    rate: Number(r.rate),
  }))
  console.log(`\nTasas disponibles: ${rates.length}` +
    (rates.length ? ` (${rates[0].rate_date} → ${rates[rates.length - 1].rate_date})` : ""))

  // ------------------------------------------------------------ orgs
  const { data: orgs } = await admin.from("organizations").select("id, name")
  const orgName = new Map<string, string>((orgs ?? []).map((o: any) => [o.id, o.name]))

  let orgIds: string[] | null = null
  if (ORG_FILTER) {
    orgIds = (orgs ?? [])
      .filter((o: any) => String(o.name).toLowerCase().includes(ORG_FILTER.toLowerCase()))
      .map((o: any) => o.id)
    if (orgIds.length === 0) {
      console.error(`No hay ninguna organización que coincida con "${ORG_FILTER}".`)
      process.exit(1)
    }
  }

  // ------------------------------------------------- operaciones objetivo
  const operaciones: any[] = []
  const PAGE = 500
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from("operations")
      .select(
        "id, org_id, file_code, destination, status, sale_amount_total, sale_currency, currency, operation_date, created_at, seller_id, seller_secondary_id"
      )
      .in("status", ESTADOS_CONFIRMADOS)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1)
    if (orgIds) q = q.in("org_id", orgIds)

    const { data, error } = await q
    if (error) {
      console.error("Error leyendo operations:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    operaciones.push(...data)
    if (data.length < PAGE) break
  }

  // Las que ya tienen asiento de confirmación quedan afuera (idempotencia
  // barata: evita traer sus patas y comisiones al pedo).
  const conAsiento = new Set<string>(
    (
      await fetchAllIn(
        "journal_entries",
        "operation_id",
        "operation_id",
        operaciones.map((o) => o.id),
        (q) => q.eq("source", "AUTO_CONFIRMATION")
      )
    ).map((j: any) => j.operation_id)
  )

  let pendientes = operaciones.filter((o) => !conAsiento.has(o.id))
  console.log(`Operaciones confirmadas: ${operaciones.length}`)
  console.log(`Ya tenían asiento: ${conAsiento.size}`)
  console.log(`Pendientes: ${pendientes.length}`)
  if (LIMIT) pendientes = pendientes.slice(0, LIMIT)
  if (pendientes.length === 0) {
    console.log("\nNada que hacer.")
    return
  }

  // ------------------------------------------------------- TC por operación
  const salteadas: { op: any; motivo: string }[] = []
  const aProcesar: { op: any; tc: number | null; fuenteTC: string }[] = []

  // TC propio (primer movimiento del ledger de la operación) solo para las que
  // lo necesiten: USD sin tasa por fecha.
  const necesitanTCPropio = pendientes.filter((o) => {
    const cur = o.sale_currency || o.currency || "USD"
    if (cur !== "USD") return false
    const fecha = o.operation_date || String(o.created_at).slice(0, 10)
    return rateAsOf(rates, fecha) === null
  })

  const tcPropio = new Map<string, number>()
  const movs = await fetchAllIn(
    "ledger_movements",
    "operation_id, exchange_rate, movement_date",
    "operation_id",
    necesitanTCPropio.map((o) => o.id),
    (q) => q.not("exchange_rate", "is", null).order("movement_date", { ascending: true })
  )
  for (const m of movs as any[]) {
    if (!tcPropio.has(m.operation_id)) tcPropio.set(m.operation_id, Number(m.exchange_rate))
  }

  for (const op of pendientes) {
    const cur = op.sale_currency || op.currency || "USD"
    const fecha = op.operation_date || String(op.created_at).slice(0, 10)

    if (cur !== "USD") {
      aProcesar.push({ op, tc: null, fuenteTC: "no aplica (ARS)" })
      continue
    }
    const porFecha = rateAsOf(rates, fecha)
    if (porFecha !== null) {
      aProcesar.push({ op, tc: porFecha, fuenteTC: "exchange_rates" })
      continue
    }
    const propio = tcPropio.get(op.id)
    if (propio) {
      aProcesar.push({ op, tc: propio, fuenteTC: "TC real de la operación" })
      continue
    }
    salteadas.push({ op, motivo: `sin TC para ${fecha} y sin movimientos con TC` })
  }

  // ------------------------------------------------------------- resumen
  const porFuente = new Map<string, number>()
  for (const x of aProcesar) porFuente.set(x.fuenteTC, (porFuente.get(x.fuenteTC) ?? 0) + 1)
  console.log("\nOrigen del tipo de cambio:")
  for (const [k, v] of porFuente) console.log(`  ${String(v).padStart(5)}  ${k}`)
  if (salteadas.length) console.log(`  ${String(salteadas.length).padStart(5)}  SE SALTEAN (sin TC defendible)`)

  const porOrg = new Map<string, number>()
  for (const x of aProcesar) {
    const n = orgName.get(x.op.org_id) ?? x.op.org_id ?? "(sin org)"
    porOrg.set(n, (porOrg.get(n) ?? 0) + 1)
  }
  console.log("\nPor agencia:")
  for (const [k, v] of [...porOrg.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`)
  }

  console.log("\nPrimeras operaciones a asentar:")
  for (const x of aProcesar.slice(0, 5)) {
    const cur = x.op.sale_currency || x.op.currency || "USD"
    console.log(
      `  ${x.op.file_code ?? x.op.id.slice(0, 8)}  ${x.op.operation_date ?? String(x.op.created_at).slice(0, 10)}  ` +
      `${money(Number(x.op.sale_amount_total) || 0, cur)}  TC=${x.tc ?? "-"} (${x.fuenteTC})`
    )
  }
  if (aProcesar.length > 5) console.log(`  ... y ${aProcesar.length - 5} más`)

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.")
    console.log("-".repeat(78))
    if (salteadas.length) {
      console.log(`\n${salteadas.length} operaciones salteadas por falta de TC. Primeras:`)
      for (const s of salteadas.slice(0, 10)) {
        console.log(`  ${s.op.file_code ?? s.op.id.slice(0, 8)}  ${s.motivo}`)
      }
    }
    return
  }

  // ------------------------------------------------------------- aplicar
  const {
    createSaleJournalEntry,
    createCostJournalEntry,
    createCommissionJournalEntry,
  } = await import("../lib/accounting/journal-entries")

  let venta = 0, costo = 0, comision = 0, fallidas = 0, comisionesAjenas = 0
  const errores: string[] = []

  for (const [i, x] of aProcesar.entries()) {
    const op = { ...x.op, exchange_rate: x.tc }
    const code = op.file_code ?? op.id.slice(0, 8)
    try {
      if (await createSaleJournalEntry(op, admin as any)) venta++

      const { data: patas } = await (admin.from("operation_operators") as any)
        .select("operator_id, cost, cost_currency, product_type, operators:operator_id(id, name)")
        .eq("operation_id", op.id)
      if (await createCostJournalEntry(op, patas || [], admin as any)) costo++

      // El asiento de comisión solo sabe armar líneas para el vendedor
      // principal y el secundario de la operación. Si hay comisiones a nombre
      // de un tercero (comisión de servicio vendida por otro, ADVISOR_MANAGER),
      // el Debe no cerraría contra el Haber y el asiento saldría desbalanceado:
      // en ese caso NO se asienta y se reporta, que es preferible a asentar de
      // menos en silencio.
      const { data: comis } = await (admin.from("commission_records") as any)
        .select("seller_id, amount, kind")
        .eq("operation_id", op.id)

      const suma = (pred: (c: any) => boolean) =>
        (comis ?? []).filter(pred).reduce((acc: number, c: any) => acc + Number(c.amount || 0), 0)

      const primary = op.seller_id ? suma((c: any) => c.seller_id === op.seller_id) : 0
      const secondary = op.seller_secondary_id
        ? suma((c: any) => c.seller_id === op.seller_secondary_id)
        : 0
      const ajenas = suma(
        (c: any) => c.seller_id !== op.seller_id && c.seller_id !== op.seller_secondary_id
      )

      if (ajenas > 0) {
        comisionesAjenas++
      } else if (primary + secondary > 0) {
        const commissionData = {
          totalCommission: primary + secondary,
          primaryCommission: primary,
          secondaryCommission: secondary || null,
        }
        if (await createCommissionJournalEntry(op, commissionData, admin as any)) comision++
      }
    } catch (e: any) {
      fallidas++
      errores.push(`${code}: ${e.message}`)
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  ... ${i + 1}/${aProcesar.length} (venta ${venta} · costo ${costo} · comisión ${comision})`)
    }
  }

  console.log("\n" + "-".repeat(78))
  console.log(`Asientos de VENTA creados    : ${venta}`)
  console.log(`Asientos de COSTO creados    : ${costo}`)
  console.log(`Asientos de COMISIÓN creados : ${comision}`)
  console.log(`Comisiones NO asentadas      : ${comisionesAjenas} (a nombre de un vendedor ajeno a la operación)`)
  console.log(`Operaciones con error        : ${fallidas}`)
  console.log(`Operaciones salteadas (sin TC): ${salteadas.length}`)
  if (errores.length) {
    console.log("\nPrimeros errores:")
    for (const e of errores.slice(0, 10)) console.log(`  ${e}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
