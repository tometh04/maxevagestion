/**
 * VIB-149 (READ-ONLY): salidas de plata que los reportes de resultado cuentan
 * como gasto sin serlo.
 *
 * Contabilidad → Ganancias y la Posición Mensual suman `ledger_movements` con
 * `type = 'EXPENSE'`. Eso mete adentro cosas que no son gasto:
 *
 *   A. Transferencias entre cuentas propias (incluida la compra/venta de
 *      dólares). La plata cambia de bolsillo, no sale de la agencia. → ARREGLADO
 *   B. Egresos que el usuario marcó "no es gasto" desde Caja (VIB-125/164) y que
 *      igual pesaban acá. → ARREGLADO
 *   C. Ajustes manuales de saldo. → criterio del contador, sin resolver
 *   D. Retiros de socio (distribución de utilidades). → criterio, sin resolver
 *   E. Movimientos ya reversados que se siguen sumando. → sin resolver
 *
 * Corre después de cada cambio para ver si A y B volvieron a aparecer y cuánto
 * queda de C, D y E.
 *
 * Run: npx tsx scripts/audit-non-expense-outflows.ts [añoDesde]
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DESDE = `${process.argv[2] || "2026"}-01-01`

async function fetchAll<T>(build: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

const fmt = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Patrón de concepto de una transferencia. Sólo para auditar lo histórico: el
 *  criterio que usan los reportes es la columna `is_internal_transfer`. */
const esConceptoDeTransferencia = (c: string) =>
  /^(compra|venta) de d[óo]lares/i.test(c) || /^transferencia (de "|a |desde )/i.test(c)

type Clase = "A. transferencia interna" | "B. marcado no es gasto" | "C. ajuste de saldo" | "D. retiro de socio" | "E. reversado"

async function main() {
  const orgs = await fetchAll<any>((f, t) => admin.from("organizations").select("id, name").range(f, t))
  const orgName = new Map(orgs.map((o) => [o.id, o.name]))

  // El script tiene que servir ANTES y DESPUÉS de la migración: antes, para
  // medir el agujero; después, para verificar que se cerró.
  const base = "id, org_id, type, concept, currency, amount_original, movement_date, account_id, reversed_at"
  const query = (cols: string) => (f: number, t: number) =>
    admin
      .from("ledger_movements")
      .select(cols)
      .eq("type", "EXPENSE")
      .not("account_id", "is", null)
      .gte("movement_date", DESDE)
      .range(f, t)

  let conColumna = true
  let movs: any[]
  try {
    movs = await fetchAll<any>(query(`${base}, is_internal_transfer`))
  } catch (e: any) {
    if (e?.code !== "42703") throw e
    conColumna = false
    console.log("⚠  La columna is_internal_transfer todavía no existe: migración sin aplicar.\n")
    movs = await fetchAll<any>(query(base))
  }

  const noGasto = new Set(
    (
      await fetchAll<any>((f, t) =>
        admin
          .from("cash_movements")
          .select("ledger_movement_id")
          .eq("type", "EXPENSE")
          .eq("is_agency_expense", false)
          .not("ledger_movement_id", "is", null)
          .range(f, t)
      )
    ).map((c) => c.ledger_movement_id)
  )

  const clasificar = (m: any): Clase | null => {
    if (m.is_internal_transfer === true || esConceptoDeTransferencia(m.concept || "")) return "A. transferencia interna"
    if (noGasto.has(m.id)) return "B. marcado no es gasto"
    if (/ajuste manual de saldo/i.test(m.concept || "")) return "C. ajuste de saldo"
    if (/retiro (socio|personal)/i.test(m.concept || "")) return "D. retiro de socio"
    if (m.reversed_at) return "E. reversado"
    return null
  }

  const totales = new Map<Clase, { n: number; ars: number; usd: number }>()
  for (const m of movs) {
    const clase = clasificar(m)
    if (!clase) continue
    const acc = totales.get(clase) ?? { n: 0, ars: 0, usd: 0 }
    acc.n++
    if (m.currency === "USD") acc.usd += Number(m.amount_original) || 0
    else acc.ars += Number(m.amount_original) || 0
    totales.set(clase, acc)
  }

  console.log(`EXPENSE con cuenta financiera desde ${DESDE}: ${movs.length}\n`)
  console.log("clase                          n        ARS                 USD")
  for (const [clase, v] of [...totales.entries()].sort()) {
    console.log(`${clase.padEnd(26)} ${String(v.n).padStart(4)}  ${fmt(v.ars).padStart(18)}  ${fmt(v.usd).padStart(14)}`)
  }

  const sinMarcar = movs.filter(
    (m) => esConceptoDeTransferencia(m.concept || "") && m.is_internal_transfer !== true
  )
  if (conColumna) {
    console.log(
      `\nTransferencias que el patrón reconoce pero SIN la marca en la base: ${sinMarcar.length}` +
        (sinMarcar.length ? "  ← el backfill no las alcanzó, o un alta nueva no está seteando la marca" : "  ✓")
    )
  }

  console.log("\n=== Impacto por org y trimestre (lo que deja de contarse como gasto) ===")
  const q = (d: string) => `${d.slice(0, 4)}-Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`
  const filas = new Map<string, { totARS: number; totUSD: number; fueraARS: number; fueraUSD: number }>()
  for (const m of movs) {
    const k = `${orgName.get(m.org_id) ?? m.org_id}|${q(String(m.movement_date))}`
    const f = filas.get(k) ?? { totARS: 0, totUSD: 0, fueraARS: 0, fueraUSD: 0 }
    const a = Number(m.amount_original) || 0
    const esUSD = m.currency === "USD"
    if (esUSD) f.totUSD += a
    else f.totARS += a
    const clase = clasificar(m)
    if (clase === "A. transferencia interna" || clase === "B. marcado no es gasto") {
      if (esUSD) f.fueraUSD += a
      else f.fueraARS += a
    }
    filas.set(k, f)
  }
  console.log("org / trimestre        gastos ARS antes        salen de ahí       gastos USD antes     salen")
  for (const [k, v] of [...filas.entries()].sort()) {
    if (!v.fueraARS && !v.fueraUSD) continue
    const [org, qq] = k.split("|")
    console.log(
      `${org.slice(0, 18).padEnd(19)}${qq}  ${fmt(v.totARS).padStart(18)}  ${fmt(v.fueraARS).padStart(18)}  ${fmt(v.totUSD).padStart(14)}  ${fmt(v.fueraUSD).padStart(12)}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
