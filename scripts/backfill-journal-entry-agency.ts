/**
 * Completa la agencia en los asientos que ya existen — VIB-143.
 *
 * POR QUÉ
 * -------
 * Los asientos solo tenían organización, pero una organización puede tener
 * varias agencias operando por separado: Lozada Rosario tiene "Rosario" y
 * "Madero". El resto del sistema ya filtra por agencia y la contabilidad
 * quedaba afuera.
 *
 * DE DÓNDE SALE
 * -------------
 * Por orden de confianza:
 *
 *   1. La agencia de la OPERACIÓN del asiento. Es la más directa: el asiento de
 *      una venta pertenece a la sucursal que vendió.
 *   2. La agencia de la CUENTA FINANCIERA del movimiento que lo originó. Para
 *      gastos y movimientos de caja que no cuelgan de una operación.
 *
 * Medido sobre Lozada antes de escribir esto: de 8.650 asientos, 7.636 se
 * resuelven por la operación y 1.013 por la cuenta. Uno solo queda sin
 * atribuir, y ese se deja en NULL a propósito: aparece en el consolidado, que
 * es lo correcto, en vez de inventarle una sucursal.
 *
 * NO ROMPE NADA
 * -------------
 * Solo escribe `agency_id`, una columna nueva que hoy no lee nadie. No toca
 * importes, ni cuentas, ni líneas, ni movimientos de plata.
 *
 *   Dry-run (default):  npx tsx scripts/backfill-journal-entry-agency.ts
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

async function q(sql: string): Promise<any[]> {
  const r = await admin.rpc("execute_readonly_query" as any, { query_text: sql } as any)
  if (r.error) {
    console.error("Error:", r.error.message)
    process.exit(1)
  }
  return (r.data as any[]) ?? []
}

async function main() {
  console.log("=".repeat(78))
  console.log(`AGENCIA en los asientos existentes — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
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
  const orgSql = `(${orgIds.map((id) => `'${id}'`).join(",")})`

  // La resolución completa en una sola consulta: primero la operación, después
  // la cuenta financiera del movimiento de origen.
  const filas = await q(
    `select je.id,
            coalesce(o.agency_id, fa.agency_id) as agency_id,
            case when o.agency_id is not null then 'operación'
                 when fa.agency_id is not null then 'cuenta financiera'
                 else 'sin atribuir' end as fuente,
            a.name as agencia,
            org.name as organizacion
     from journal_entries je
     join organizations org on org.id = je.org_id
     left join operations o on o.id = je.operation_id
     left join ledger_movements origen on origen.id = je.source_movement_id
     left join financial_accounts fa on fa.id = origen.account_id
     left join agencies a on a.id = coalesce(o.agency_id, fa.agency_id)
     where je.org_id in ${orgSql} and je.agency_id is null`
  )

  console.log(`\nAsientos sin agencia: ${filas.length}`)

  const porFuente = new Map<string, number>()
  const porAgencia = new Map<string, number>()
  for (const f of filas) {
    porFuente.set(f.fuente, (porFuente.get(f.fuente) ?? 0) + 1)
    const k = `${f.organizacion} · ${f.agencia ?? "(sin atribuir)"}`
    porAgencia.set(k, (porAgencia.get(k) ?? 0) + 1)
  }

  console.log("\nDe dónde sale la agencia:")
  for (const [k, v] of [...porFuente.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(v).padStart(5)}  ${k}`)
  }
  console.log("\nQuedarían repartidos así:")
  for (const [k, v] of [...porAgencia.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(v).padStart(5)}  ${k}`)
  }

  const aEscribir = filas.filter((f) => f.agency_id)
  console.log(`\nA completar: ${aEscribir.length}`)
  console.log(`Quedan en NULL (aparecen en el consolidado): ${filas.length - aEscribir.length}`)

  if (!APPLY || aEscribir.length === 0) {
    if (!APPLY) {
      console.log("\n" + "-".repeat(78))
      console.log("DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.")
      console.log("Solo escribe agency_id, una columna que hoy no lee nadie.")
      console.log("-".repeat(78))
    }
    return
  }

  // Agrupado por agencia: un update por grupo en vez de uno por asiento.
  const porId = new Map<string, string[]>()
  for (const f of aEscribir) {
    if (!porId.has(f.agency_id)) porId.set(f.agency_id, [])
    porId.get(f.agency_id)!.push(f.id)
  }

  let ok = 0
  for (const [agencyId, ids] of porId.entries()) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error } = await admin
        .from("journal_entries")
        .update({ agency_id: agencyId } as any)
        .in("id", chunk)
      if (error) {
        console.error("Error escribiendo:", error.message)
        process.exit(1)
      }
      ok += chunk.length
      if (ok % 1000 === 0) console.log(`   ... ${ok}/${aEscribir.length}`)
    }
  }

  console.log(`\nCompletados: ${ok}`)

  const restantes = await q(
    `select count(*) as n from journal_entries where org_id in ${orgSql} and agency_id is null`
  )
  console.log(`Quedan sin agencia: ${restantes[0]?.n}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
