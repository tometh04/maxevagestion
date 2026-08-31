/**
 * Preview del cierre de ejercicio — solo lectura, no escribe nada.
 *
 * Corre el mismo cálculo que el cierre real y lo contrasta contra el Estado de
 * Resultados, que es la comprobación que importa: el resultado que la
 * refundición lleva al patrimonio tiene que ser exactamente el que el estado
 * viene mostrando. Si difieren, uno de los dos está mal y el cierre lo dejaría
 * grabado para siempre.
 *
 *   npx tsx scripts/preview-year-end-close.ts --agency "Rosario" --desde 2026-01-01 --hasta 2026-08-30
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import {
  agruparResultadosPorMoneda,
  calcularSaldosPorCuenta,
} from "../lib/accounting/chart-account-balances"
import { armarCierreDeEjercicio } from "../lib/accounting/year-end-close"

config({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function arg(nombre: string, porDefecto?: string): string {
  const i = process.argv.indexOf(`--${nombre}`)
  const v = i >= 0 ? process.argv[i + 1] : undefined
  if (!v && porDefecto === undefined) throw new Error(`Falta --${nombre}`)
  return v ?? porDefecto!
}

const plata = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const nombre = arg("agency")
  const desde = arg("desde")
  const hasta = arg("hasta")

  const { data: agencias } = await admin
    .from("agencies")
    .select("id, name, org_id")
    .ilike("name", nombre)
  const agencia = (agencias ?? [])[0] as any
  if (!agencia) throw new Error(`No existe la agencia "${nombre}"`)

  console.log(`\nAgencia: ${agencia.name}`)
  console.log(`Ejercicio simulado: ${desde} al ${hasta}\n`)

  const saldos = await calcularSaldosPorCuenta(admin as any, {
    orgId: agencia.org_id,
    desde,
    hasta,
    excluirCloseKinds: ["REFUNDICION", "TRASLADO_RESULTADO"],
  })

  console.log(`Movimientos clasificados: ${saldos.clasificados}`)
  console.log(`Sin clasificar: ${saldos.sinClasificar}\n`)

  const porMoneda = agruparResultadosPorMoneda(saldos.filas)
  if (porMoneda.size === 0) {
    console.log("No hay cuentas de resultado con movimientos en el rango.\n")
    return
  }

  for (const [currency, cuentas] of Array.from(porMoneda.entries())) {
    // El resultado según las cuentas, con el criterio del Estado de Resultados:
    // ingresos por el Haber, costos y gastos por el Debe.
    let ingresos = 0
    let costos = 0
    let gastos = 0
    for (const c of cuentas) {
      if (c.account_code.startsWith("4.1")) ingresos += c.credit - c.debit
      else if (c.account_code.startsWith("4.2")) costos += c.debit - c.credit
      else if (c.account_code.startsWith("4.3")) gastos += c.debit - c.credit
    }
    const esperado = Math.round((ingresos - costos - gastos) * 100) / 100

    const cierre = armarCierreDeEjercicio(
      cuentas.map((c) => ({
        codigo: c.account_code,
        nombre: c.account_name,
        debe: c.debit,
        haber: c.credit,
      })),
      currency,
      Number(hasta.slice(0, 4))
    )

    console.log(`=== ${currency} ===`)
    console.log(`   Cuentas de resultado con saldo: ${cuentas.length}`)
    console.log(`   Ingresos      ${plata(ingresos).padStart(20)}`)
    console.log(`   Costos        ${plata(costos).padStart(20)}`)
    console.log(`   Gastos        ${plata(gastos).padStart(20)}`)
    console.log(`   Resultado     ${plata(esperado).padStart(20)}   (según las cuentas)`)

    if (!cierre) {
      console.log(`   El cierre no genera asientos.\n`)
      continue
    }

    console.log(`   Refundición   ${plata(cierre.resultado).padStart(20)}   (según el cierre)`)

    // LA comprobación: los dos números tienen que ser el mismo.
    const coincide = Math.abs(cierre.resultado - esperado) < 0.01
    console.log(`   ¿Coinciden?   ${coincide ? "SÍ" : "NO — REVISAR"}`)

    for (const a of cierre.asientos) {
      const balancea = Math.abs(a.totalDebe - a.totalHaber) < 0.01
      console.log(
        `   ${a.tipo.padEnd(20)} ${a.lineas.length} líneas   Debe ${plata(a.totalDebe)}   Haber ${plata(a.totalHaber)}   ${balancea ? "balancea" : "NO BALANCEA"}`
      )
    }
    console.log("")
  }

  console.log("--- Nada de esto se escribió. Es solo lectura. ---\n")
}

main().catch((e) => {
  console.error("\nFALLÓ:", e.message)
  process.exit(1)
})
