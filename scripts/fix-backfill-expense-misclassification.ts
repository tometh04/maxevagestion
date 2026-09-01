/**
 * Reimputa las líneas que el backfill mandó a Gastos Administrativos por error.
 *
 * QUÉ SALIÓ MAL
 * -------------
 * El backfill de asientos (VIB-142) clasificaba por el TIPO del movimiento:
 * INCOME cancelaba Cuentas por Cobrar, OPERATOR_PAYMENT y COMMISSION cancelaban
 * Cuentas por Pagar, y todo lo demás iba a Gastos Administrativos.
 *
 * El problema es que la naturaleza contable NO está en el tipo. Un movimiento
 * `EXPENSE` puede ser tres cosas distintas:
 *
 *   - el pago que cancela una deuda con un operador,
 *   - el costo de un servicio o de una pata,
 *   - un gasto operativo de verdad.
 *
 * Los dos primeros terminaron como gasto. Eso DUPLICA el costo en el Estado de
 * Resultados: una vez como Costo de Operadores al confirmar la operación, y otra
 * como gasto al pagarla. Se detectó porque los "gastos" en dólares (5,59 M)
 * superaban los ingresos (3,22 M), que es imposible.
 *
 * QUÉ NO AFECTA
 * -------------
 * Nada de lo que el cliente ve hoy. Las líneas de asiento van con
 * `affects_balance = false` y `account_id` nulo, así que no entran en ningún
 * saldo, ni en Caja, ni en Ganancias, ni en la posición mensual. El daño está
 * contenido en la capa contable, que todavía no usa nadie. Este script solo
 * cambia `chart_account_id`: no toca importes, ni fechas, ni movimientos de
 * plata, ni el Debe/Haber.
 *
 * ALCANCE
 * -------
 * Solo líneas de asientos creados por el backfill (`source_movement_id` no
 * nulo) que hoy están en 4.3.01. Con eso queda acotado exactamente al error
 * propio: no toca asientos de pagos, ni de operaciones, ni nada anterior.
 *
 * LO QUE NO SE TOCA, A PROPÓSITO
 * ------------------------------
 * Los "Retiro socio: ..." (26 líneas). Un retiro de socio no es un gasto, pero
 * la única cuenta de Patrimonio Neto del plan es 3.1.01 "Capital Social", y un
 * retiro no va contra el capital: va contra la cuenta particular del socio, que
 * no existe en el plan. Imputarlo a Capital Social sería peor que dejarlo.
 * Necesita decisión del contador.
 *
 *   Dry-run (default):  npx tsx scripts/fix-backfill-expense-misclassification.ts
 *   Una agencia:        ... --org "Lozada Rosario"
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
const ORG_FILTER = (() => {
  const i = args.indexOf("--org")
  return i >= 0 && args[i + 1] ? args[i + 1] : null
})()

/**
 * Reglas por concepto. El concepto lo escribe el propio código que crea el
 * movimiento, así que es estable y verificable: cada patrón de acá se rastreó
 * hasta la ruta que lo genera.
 */
const REGLAS: Array<{ patron: RegExp; destino: string; motivo: string }> = [
  {
    patron: /^pago (masivo a operador|por dep[oó]sito a operador|a operador|operador)/i,
    destino: "2.1.01",
    motivo: "cancela la deuda con el operador, no es un gasto nuevo",
  },
  {
    patron: /^costo (de )?operadores/i,
    destino: "4.2.01",
    motivo: "es costo de venta, no gasto operativo",
  },
  {
    patron: /^costo servicio /i,
    destino: "4.2.01",
    motivo: "es costo de venta, no gasto operativo",
  },
]

/** Se reportan pero NO se tocan: necesitan decisión contable. */
const A_REVISAR: Array<{ patron: RegExp; motivo: string }> = [
  {
    patron: /^retiro socio/i,
    motivo: "va contra la cuenta particular del socio, que no existe en el plan (3.1.01 es Capital Social)",
  },
]

async function main() {
  console.log("=".repeat(78))
  console.log(`REIMPUTAR líneas mal clasificadas — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  console.log("=".repeat(78))

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

  // Plan de cuentas por org, para resolver el destino sin cruzar tenants.
  const { data: plan } = await admin
    .from("chart_of_accounts")
    .select("id, org_id, account_code")
  const cuentaDe = new Map<string, string>()
  for (const c of (plan ?? []) as any[]) cuentaDe.set(`${c.org_id}|${c.account_code}`, c.id)

  // Las líneas en 4.3.01 que nacieron del backfill.
  const idsGasto = new Set(
    ((plan ?? []) as any[]).filter((c) => c.account_code === "4.3.01").map((c) => c.id)
  )

  const lineas: any[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from("ledger_movements")
      .select("id, org_id, concept, currency, debit_amount, chart_account_id, journal_entry_id")
      .in("chart_account_id", Array.from(idsGasto))
      .not("journal_entry_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (orgIds) q = q.in("org_id", orgIds)

    const { data, error } = await q
    if (error) {
      console.error("Error leyendo líneas:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    lineas.push(...data)
    if (data.length < PAGE) break
  }

  // Solo las de asientos del backfill.
  const entryIds = Array.from(new Set(lineas.map((l) => l.journal_entry_id)))
  const delBackfill = new Set<string>()
  for (let i = 0; i < entryIds.length; i += 200) {
    const { data } = await admin
      .from("journal_entries")
      .select("id")
      .in("id", entryIds.slice(i, i + 200))
      .not("source_movement_id", "is", null)
    for (const j of (data ?? []) as any[]) delBackfill.add(j.id)
  }

  const candidatas = lineas.filter((l) => delBackfill.has(l.journal_entry_id))
  console.log(`\nLíneas en Gastos Administrativos creadas por el backfill: ${candidatas.length}`)

  const aMover: Array<{ linea: any; destinoId: string; destino: string; motivo: string }> = []
  const aRevisar: any[] = []
  const quedan: any[] = []

  for (const linea of candidatas) {
    const concepto = String(linea.concept ?? "")
    const revisar = A_REVISAR.find((r) => r.patron.test(concepto))
    if (revisar) {
      aRevisar.push({ linea, motivo: revisar.motivo })
      continue
    }
    const regla = REGLAS.find((r) => r.patron.test(concepto))
    if (!regla) {
      quedan.push(linea)
      continue
    }
    const destinoId = cuentaDe.get(`${linea.org_id}|${regla.destino}`)
    if (!destinoId) {
      console.warn(
        `   ⚠️  ${orgName.get(linea.org_id)}: falta la cuenta ${regla.destino} en su plan; se saltea`
      )
      quedan.push(linea)
      continue
    }
    aMover.push({ linea, destinoId, destino: regla.destino, motivo: regla.motivo })
  }

  // Resumen por destino y moneda.
  const resumen = new Map<string, { lineas: number; monto: number }>()
  for (const m of aMover) {
    const k = `${m.destino} · ${m.linea.currency}`
    const e = resumen.get(k) ?? { lineas: 0, monto: 0 }
    e.lineas++
    e.monto += Number(m.linea.debit_amount) || 0
    resumen.set(k, e)
  }

  console.log(`\nA reimputar: ${aMover.length}`)
  for (const [k, e] of [...resumen.entries()].sort()) {
    console.log(`   ${k.padEnd(16)} ${String(e.lineas).padStart(5)} líneas   ${Math.round(e.monto).toLocaleString("es-AR")}`)
  }
  console.log(`\nQuedan como gasto (correcto): ${quedan.length}`)
  if (aRevisar.length > 0) {
    console.log(`\nNO se tocan, necesitan decisión contable: ${aRevisar.length}`)
    console.log(`   ${aRevisar[0].motivo}`)
  }

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.")
    console.log("Solo cambia chart_account_id: no toca importes, fechas, Debe/Haber")
    console.log("ni movimientos de plata, así que ningún saldo puede moverse.")
    console.log("-".repeat(78))
    return
  }

  let ok = 0
  const errores: string[] = []
  for (const m of aMover) {
    const { error } = await admin
      .from("ledger_movements")
      .update({ chart_account_id: m.destinoId } as any)
      .eq("id", m.linea.id)
    if (error) errores.push(`${m.linea.id}: ${error.message}`)
    else ok++
    if (ok % 500 === 0) console.log(`   ... ${ok}/${aMover.length}`)
  }

  console.log("\n" + "-".repeat(78))
  console.log(`Reimputadas: ${ok}`)
  if (errores.length) {
    console.log(`Errores: ${errores.length}`)
    for (const e of errores.slice(0, 10)) console.log(`   ${e}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
