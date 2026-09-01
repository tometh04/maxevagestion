/**
 * Borra los asientos duplicados que dejó el backfill de movimientos (VIB-142).
 *
 * QUÉ SALIÓ MAL
 * -------------
 * La capa operativa registra cada hecho económico DE A PARES: el movimiento
 * real de plata (en Caja o Banco) y su contrapartida en una cuenta técnica
 * (Cuentas por Cobrar, Cuentas por Pagar, Costo de Operadores). El backfill
 * trató cada movimiento como un hecho independiente, así que donde había un
 * hecho generó DOS asientos.
 *
 * De los 8.093 asientos que creó, 4.242 son duplicados. Algunos son directamente
 * absurdos: hay asientos con el Debe y el Haber en la MISMA cuenta de Cuentas
 * por Cobrar, porque el movimiento de contrapartida vive en una cuenta
 * financiera que mapea al mismo lugar que su propia contrapartida contable.
 *
 * POR QUÉ NO LO DETECTARON LAS VERIFICACIONES ANTERIORES
 * -----------------------------------------------------
 * Se chequeaba que los asientos estuvieran balanceados, que no movieran saldos,
 * que no cruzaran organizaciones y que no marcaran comisiones como pagadas.
 * Todo eso daba bien: **un asiento duplicado está perfectamente balanceado**.
 *
 * Faltaba la verificación de fondo: que el total contable se parezca a la
 * realidad del negocio. La señal fue que los "gastos" en dólares superaban a los
 * ingresos, lo cual es imposible. Por eso este script la incorpora como chequeo
 * de salida.
 *
 * LA REGLA
 * --------
 * Un movimiento REAL de plata vive en Caja, Bancos o Mercado Pago
 * (1.1.01 / 1.1.02 / 1.1.04). Una contrapartida técnica vive en el resto.
 * Se borran los asientos cuyo movimiento de origen está en una cuenta técnica.
 *
 * QUÉ NO TOCA
 * -----------
 * Solo asientos con `source_movement_id` no nulo, o sea los que creó el
 * backfill. No toca los de venta, costo y comisión de las operaciones, ni los
 * de pagos (`annotatePaymentAsJournalEntry`), ni ningún movimiento de plata.
 *
 * Borrar el asiento borra sus líneas, que son filas creadas por el propio
 * backfill con `account_id` nulo y `affects_balance = false`: no están en
 * ningún saldo, así que ningún número se mueve.
 *
 *   Dry-run (default):  npx tsx scripts/delete-duplicate-backfill-entries.ts
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

/** Donde vive la plata de verdad. Todo lo demás es contrapartida técnica. */
const CUENTAS_DE_PLATA = ["1.1.01", "1.1.02", "1.1.04"]

async function q(sql: string): Promise<any[]> {
  const r = await admin.rpc("execute_readonly_query" as any, { query_text: sql } as any)
  if (r.error) {
    console.error("Error:", r.error.message)
    process.exit(1)
  }
  return (r.data as any[]) ?? []
}

/** Resultado contable por moneda, para el chequeo de realidad. */
async function resultado(orgIdSql: string) {
  return q(
    `select lm.currency,
       round(sum(coalesce(lm.credit_amount,0)) filter (where c.account_code like '4.1%')::numeric) as ingresos,
       round(sum(coalesce(lm.debit_amount,0)) filter (where c.account_code like '4.2%')::numeric) as costos,
       round(sum(coalesce(lm.debit_amount,0)) filter (where c.account_code like '4.3%')::numeric) as gastos
     from ledger_movements lm join chart_of_accounts c on c.id = lm.chart_account_id
     where lm.org_id in ${orgIdSql} and lm.movement_date >= '2026-01-01' group by 1 order by 1`
  )
}

function mostrarResultado(titulo: string, filas: any[]) {
  console.log(`\n${titulo}`)
  for (const f of filas) {
    const ing = Number(f.ingresos) || 0
    const cos = Number(f.costos) || 0
    const gas = Number(f.gastos) || 0
    const alerta = cos > ing ? "  ⚠️ los costos superan a los ingresos" : ""
    console.log(
      `   ${f.currency}  ingresos=${ing.toLocaleString("es-AR").padStart(15)}  costos=${cos.toLocaleString("es-AR").padStart(15)}  gastos=${gas.toLocaleString("es-AR").padStart(15)}${alerta}`
    )
  }
}

async function main() {
  console.log("=".repeat(78))
  console.log(`BORRAR asientos duplicados del backfill — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  console.log("=".repeat(78))

  const { data: orgs } = await admin.from("organizations").select("id, name")
  let orgIds = ((orgs ?? []) as any[]).map((o) => o.id)
  if (ORG_FILTER) {
    orgIds = ((orgs ?? []) as any[])
      .filter((o) => String(o.name).toLowerCase().includes(ORG_FILTER.toLowerCase()))
      .map((o) => o.id)
    if (orgIds.length === 0) {
      console.error(`No hay ninguna organización que coincida con "${ORG_FILTER}".`)
      process.exit(1)
    }
  }
  const orgIdSql = `(${orgIds.map((id) => `'${id}'`).join(",")})`

  const codigos = CUENTAS_DE_PLATA.map((c) => `'${c}'`).join(",")

  // Los asientos a borrar: los que nacieron de una contrapartida técnica.
  const filas = await q(
    `select je.id, org.name as agencia, coalesce(c.account_code, 'sin cuenta') as cuenta_origen
     from journal_entries je
     join ledger_movements origen on origen.id = je.source_movement_id
     join organizations org on org.id = je.org_id
     left join financial_accounts fa on fa.id = origen.account_id
     left join chart_of_accounts c on c.id = fa.chart_account_id
     where je.source_movement_id is not null
       and je.org_id in ${orgIdSql}
       and (c.account_code is null or c.account_code not in (${codigos}))`
  )

  console.log(`\nAsientos duplicados a borrar: ${filas.length}`)
  const porCuenta = new Map<string, number>()
  const porAgencia = new Map<string, number>()
  for (const f of filas) {
    porCuenta.set(f.cuenta_origen, (porCuenta.get(f.cuenta_origen) ?? 0) + 1)
    porAgencia.set(f.agencia, (porAgencia.get(f.agencia) ?? 0) + 1)
  }
  console.log("\nPor cuenta del movimiento de origen:")
  for (const [k, v] of [...porCuenta.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(v).padStart(5)}  ${k}`)
  }
  console.log("\nPor agencia:")
  for (const [k, v] of [...porAgencia.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(v).padStart(5)}  ${k}`)
  }

  const antes = await resultado(orgIdSql)
  mostrarResultado("RESULTADO CONTABLE ANTES (ejercicio 2026):", antes)

  if (filas.length === 0) {
    console.log("\nNada que borrar.")
    return
  }

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se borró nada. Volvé a correr con --apply para aplicar.")
    console.log("Las líneas de estos asientos tienen account_id nulo y affects_balance")
    console.log("false, así que no están en ningún saldo: borrarlas no mueve un peso.")
    console.log("-".repeat(78))
    return
  }

  const ids = filas.map((f) => f.id)
  let borradas = 0
  let borrados = 0
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    // Primero las líneas: journal_entry_id es ON DELETE SET NULL, así que sin
    // esto quedarían huérfanas y seguirían contando en el mayor.
    const { error: e1, count } = await admin
      .from("ledger_movements")
      .delete({ count: "exact" })
      .in("journal_entry_id", chunk)
    if (e1) {
      console.error("Error borrando líneas:", e1.message)
      process.exit(1)
    }
    borradas += count ?? 0

    const { error: e2 } = await admin.from("journal_entries").delete().in("id", chunk)
    if (e2) {
      console.error("Error borrando asientos:", e2.message)
      process.exit(1)
    }
    borrados += chunk.length
    if (borrados % 500 === 0) console.log(`   ... ${borrados}/${ids.length}`)
  }

  console.log(`\nAsientos borrados: ${borrados}`)
  console.log(`Líneas borradas:   ${borradas}`)

  const despues = await resultado(orgIdSql)
  mostrarResultado("RESULTADO CONTABLE DESPUÉS:", despues)

  const malo = despues.some((f) => (Number(f.costos) || 0) > (Number(f.ingresos) || 0))
  console.log("\n" + "-".repeat(78))
  if (malo) {
    console.log("⚠️  Todavía hay una moneda donde los costos superan a los ingresos.")
    console.log("   Queda algo mal imputado: NO seguir hasta entender qué.")
    process.exitCode = 1
  } else {
    console.log("✅ En ninguna moneda los costos superan a los ingresos.")
  }
  console.log("-".repeat(78))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
