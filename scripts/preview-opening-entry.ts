/**
 * Preview del asiento de apertura — solo lectura, no escribe nada.
 *
 * Corre el mismo cálculo que usaría el asiento real, para poder contrastar los
 * saldos contra lo que la agencia sabe que tiene antes de generar nada.
 *
 *   npx tsx scripts/preview-opening-entry.ts --agency "Rosario" --start 2026-09-01
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { calcularApertura } from "../lib/accounting/opening-balances"

config({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function arg(nombre: string): string {
  const i = process.argv.indexOf(`--${nombre}`)
  const v = i >= 0 ? process.argv[i + 1] : undefined
  if (!v) throw new Error(`Falta --${nombre}`)
  return v
}

const plata = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const nombre = arg("agency")
  const inicio = arg("start")

  const { data: agencias } = await admin
    .from("agencies")
    .select("id, name, org_id")
    .ilike("name", nombre)
  const agencia = (agencias ?? [])[0] as any
  if (!agencia) throw new Error(`No existe la agencia "${nombre}"`)

  const r = await calcularApertura(admin as any, {
    orgId: agencia.org_id,
    agencyId: agencia.id,
    fechaDeInicio: inicio,
  })

  console.log(`\nAgencia: ${agencia.name}`)
  console.log(`Contabilidad arranca: ${inicio}`)
  console.log(`Los saldos retratan el cierre del: ${r.corte}\n`)

  if (r.cuentasSinPlan.length > 0) {
    console.log(`AVISO — cuentas financieras sin cuenta contable asignada, quedan afuera:`)
    for (const c of r.cuentasSinPlan) console.log(`   · ${c}`)
    console.log("")
  }

  if (r.excluidas.length > 0) {
    console.log("Cuentas de control excluidas a propósito:")
    for (const c of r.excluidas) console.log(`   · ${c}`)
    console.log("")
  }

  if (r.asientos.length === 0) {
    console.log("No hay saldos previos: la agencia arranca de cero y no necesita apertura.\n")
    return
  }

  for (const a of r.asientos) {
    console.log(`=== ASIENTO DE APERTURA EN ${a.currency} ===`)
    console.log(`   ${"Cuenta".padEnd(9)} ${"Detalle".padEnd(46)} ${"Debe".padStart(16)} ${"Haber".padStart(16)}`)
    for (const l of a.lineas) {
      console.log(
        `   ${l.codigo.padEnd(9)} ${l.detalle.slice(0, 46).padEnd(46)} ` +
          `${(l.debe ? plata(l.debe) : "").padStart(16)} ${(l.haber ? plata(l.haber) : "").padStart(16)}`
      )
    }
    console.log(`   ${"".padEnd(9)} ${"TOTALES".padEnd(46)} ${plata(a.totalDebe).padStart(16)} ${plata(a.totalHaber).padStart(16)}`)
    console.log(
      `   Balancea: ${Math.abs(a.totalDebe - a.totalHaber) < 0.01 ? "sí" : "NO"}   ` +
        `Patrimonio inicial: ${plata(a.resultadosAcumulados)} ${a.currency}\n`
    )
  }

  console.log("--- Nada de esto se escribió. Es solo lectura. ---\n")
}

main().catch((e) => {
  console.error("\nFALLÓ:", e.message)
  process.exit(1)
})
