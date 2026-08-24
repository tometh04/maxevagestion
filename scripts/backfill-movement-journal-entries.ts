/**
 * Backfill de asientos para los movimientos de plata — VIB-142.
 *
 * CONTEXTO
 * --------
 * De los 21 flujos que crean movimientos de dinero, 18 no generaban ningún
 * asiento: quedaba registrada la venta pero no el cobro, el costo pero no el
 * pago. Las etapas 2 y 3 cerraron el hueco de acá en adelante; este script cubre
 * los ~9.600 movimientos que quedaron atrás.
 *
 * POR QUÉ NO PUEDE MOVER UN SALDO
 * -------------------------------
 * No escribe sobre ningún movimiento existente. Crea el asiento con filas
 * NUEVAS (`account_id` nulo, `affects_balance = false`) y deja el movimiento
 * original intacto. `getAccountBalancesBatch` filtra por `affects_balance =
 * true`, así que las líneas nuevas le son invisibles.
 *
 * Esto NO es un detalle: esa misma función elige entre dos ramas de cálculo
 * según si `debit_amount`/`credit_amount` están en NULL. Escribirlas sobre un
 * movimiento existente lo haría cambiar de rama y podría mover el saldo de una
 * cuenta real.
 *
 * QUÉ SE EXCLUYE, Y POR QUÉ IMPORTA
 * ---------------------------------
 * Los movimientos `EXPENSE` NO son todos gastos. Medido en producción:
 *
 *   - 115 transferencias entre cuentas propias .... ARS 1.221.149.448
 *   -  54 compras/ventas de dólares ............... ARS   298.187.385
 *   -   4 contra-movimientos ...................... ARS    83.570.701
 *
 * Asentar eso como gasto inflaría el resultado del ejercicio en ~ARS 1.600
 * millones. Una transferencia mueve plata de un bolsillo propio a otro y no es
 * una pérdida; la compra de dólares es un cambio de activo. Ambas necesitan
 * además la definición de moneda funcional y diferencia de cambio (VIB-141), así
 * que se saltean y se reportan.
 *
 * El FX (`FX_GAIN` / `FX_LOSS`) se saltea por lo mismo.
 *
 *   Dry-run (default):  npx tsx scripts/backfill-movement-journal-entries.ts
 *   Una agencia:        ... --org "Milla Cero"
 *   De a poco:          ... --limit 200
 *   Aplicar:            ... --apply
 *
 * Verificar saldos antes y después:
 *   npx tsx scripts/snapshot-account-balances.ts > antes.json
 *   ... --apply
 *   npx tsx scripts/snapshot-account-balances.ts > despues.json
 *   (la diferencia debe ser exactamente cero)
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

/** Conceptos que NO son un hecho económico de resultado. */
const EXCLUIDOS: { test: RegExp; motivo: string }[] = [
  { test: /^transferencia/i, motivo: "transferencia entre cuentas propias" },
  { test: /^(compra|venta) de d[oó]lares/i, motivo: "compra/venta de dólares (VIB-141)" },
  { test: /^contra-movimiento/i, motivo: "contrapartida de otro movimiento" },
]

function claseDeMovimiento(mov: any): { counterpartCode: string; direction: "IN" | "OUT" } | null {
  switch (mov.type) {
    case "INCOME":
      // Cobro: cancela la deuda del cliente, no vuelve a registrar la venta.
      return { counterpartCode: "1.1.03", direction: "IN" }
    case "OPERATOR_PAYMENT":
    case "COMMISSION":
      // Cancelan una deuda ya devengada (Cuentas por Pagar).
      return { counterpartCode: "2.1.01", direction: "OUT" }
    case "EXPENSE":
      // Se devenga y se paga en el mismo acto: va contra resultado.
      return { counterpartCode: "4.3.01", direction: "OUT" }
    default:
      // FX_GAIN / FX_LOSS: esperan la definición de moneda funcional (VIB-141).
      return null
  }
}

async function main() {
  console.log("=".repeat(78))
  console.log(`BACKFILL de asientos de movimientos — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  if (ORG_FILTER) console.log(`Agencia: ${ORG_FILTER}`)
  if (LIMIT) console.log(`Tope: ${LIMIT} movimientos`)
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

  // Universo: movimientos de plata sin asiento. `journal_entry_id IS NULL`
  // deja afuera los pagos que ya usan annotatePaymentAsJournalEntry, que NO se
  // tocan.
  const movimientos: any[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from("ledger_movements")
      .select("id, org_id, type, concept, currency, amount_original, amount_ars_equivalent, account_id, affects_balance, movement_date")
      .is("journal_entry_id", null)
      .eq("affects_balance", true)
      .not("account_id", "is", null)
      .order("movement_date", { ascending: true })
      .range(from, from + PAGE - 1)
    if (orgIds) q = q.in("org_id", orgIds)

    const { data, error } = await q
    if (error) {
      console.error("Error leyendo ledger_movements:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    movimientos.push(...data)
    if (data.length < PAGE) break
  }

  // Los que este script YA asentó.
  //
  // No alcanza con `journal_entry_id IS NULL` en el movimiento: como acá se
  // espeja y no se anota, el movimiento original queda intacto y sigue
  // apareciendo como "sin asiento" para siempre. Sin este filtro cada corrida
  // reintenta todo lo anterior, se lo come el índice único y quema el cupo de
  // --limit sin avanzar.
  const yaAsentados = new Set<string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("journal_entries")
      .select("source_movement_id")
      .not("source_movement_id", "is", null)
      .range(from, from + PAGE - 1)
    if (error) {
      console.error("Error leyendo asientos previos:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const j of data as any[]) yaAsentados.add(j.source_movement_id)
    if (data.length < PAGE) break
  }

  const pendientes = movimientos.filter((m) => !yaAsentados.has(m.id))

  console.log(`\nMovimientos de plata sin asiento: ${movimientos.length}`)
  console.log(`Ya asentados por una corrida previa: ${movimientos.length - pendientes.length}`)

  const aProcesar: any[] = []
  const salteados = new Map<string, { movimientos: number; ars: number }>()
  const anotarSalteo = (motivo: string, mov: any) => {
    const e = salteados.get(motivo) ?? { movimientos: 0, ars: 0 }
    e.movimientos++
    e.ars += Number(mov.amount_ars_equivalent ?? 0)
    salteados.set(motivo, e)
  }

  for (const mov of pendientes) {
    const concepto = String(mov.concept ?? "")
    const excluido = EXCLUIDOS.find((e) => e.test.test(concepto))
    if (excluido) {
      anotarSalteo(excluido.motivo, mov)
      continue
    }
    if (Number(mov.amount_original) <= 0) {
      anotarSalteo("importe cero", mov)
      continue
    }
    const clase = claseDeMovimiento(mov)
    if (!clase) {
      anotarSalteo(`tipo ${mov.type} (espera VIB-141)`, mov)
      continue
    }
    aProcesar.push({ mov, ...clase })
  }

  console.log(`A asentar: ${aProcesar.length}`)
  if (salteados.size > 0) {
    console.log("\nSe saltean a propósito:")
    for (const [motivo, e] of [...salteados.entries()].sort((a, b) => b[1].movimientos - a[1].movimientos)) {
      console.log(`  ${String(e.movimientos).padStart(5)}  ${motivo}`)
    }
  }

  const porTipo = new Map<string, number>()
  for (const x of aProcesar) porTipo.set(x.mov.type, (porTipo.get(x.mov.type) ?? 0) + 1)
  console.log("\nPor tipo:")
  for (const [t, n] of [...porTipo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${t}`)
  }

  const porOrg = new Map<string, number>()
  for (const x of aProcesar) {
    const n = orgName.get(x.mov.org_id) ?? x.mov.org_id ?? "(sin org)"
    porOrg.set(n, (porOrg.get(n) ?? 0) + 1)
  }
  console.log("\nPor agencia:")
  for (const [k, v] of [...porOrg.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`)
  }

  const lote = LIMIT ? aProcesar.slice(0, LIMIT) : aProcesar

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log(`DRY-RUN: no se escribió nada. Se asentarían ${lote.length} movimientos.`)
    console.log("Volvé a correr con --apply para aplicar.")
    console.log("-".repeat(78))
    return
  }

  const { createMovementJournalEntry } = await import("../lib/accounting/movement-journal")

  let creados = 0
  let sinEfecto = 0
  const errores: string[] = []

  for (const [i, x] of lote.entries()) {
    try {
      const id = await createMovementJournalEntry(
        {
          movementId: x.mov.id,
          counterpartCode: x.counterpartCode,
          direction: x.direction,
          orgId: x.mov.org_id,
        },
        admin as any
      )
      if (id) creados++
      else sinEfecto++
    } catch (e: any) {
      errores.push(`${x.mov.id}: ${e.message}`)
    }

    if ((i + 1) % 200 === 0) console.log(`  ... ${i + 1}/${lote.length} (creados ${creados})`)
  }

  console.log("\n" + "-".repeat(78))
  console.log(`Asientos creados            : ${creados}`)
  console.log(`Sin efecto (ya estaba, sin cuenta contable, etc.): ${sinEfecto}`)
  console.log(`Errores                     : ${errores.length}`)
  if (errores.length) {
    console.log("\nPrimeros errores:")
    for (const e of errores.slice(0, 10)) console.log(`  ${e}`)
  }
  console.log("\nAcordate de comparar los saldos antes/después: la diferencia debe ser cero.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
