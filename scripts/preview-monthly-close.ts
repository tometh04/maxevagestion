/**
 * Preview del cierre mensual — solo lectura, no escribe absolutamente nada.
 *
 * Corre EL MISMO código que el cierre real: `recolectarOperaciones` y
 * `planificarCierre` son los de producción. Es lo que hace que el preview sirva
 * de algo: si tuviera su propia copia de la recolección, podría mostrar unos
 * números y el cierre escribir otros.
 *
 * Sirve para contrastar contra la realidad del negocio antes de habilitar nada.
 * Un cierre que balancea perfectamente y dice que la mitad de los clientes pagó
 * de más está mal, y eso solo se nota mirando los números.
 *
 *   npx tsx scripts/preview-monthly-close.ts --agency "Rosario" --period 2026-07 --since 2026-06-01
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { rangoDelPeriodo } from "../lib/accounting/accounting-periods"
import { leerConfiguracion, recolectarOperaciones } from "../lib/accounting/monthly-close"
import { planificarCierre } from "../lib/accounting/monthly-close-plan"

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

const plata = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function main() {
  const nombreAgencia = arg("agency")
  const periodo = arg("period")
  const { hasta } = rangoDelPeriodo(periodo)

  const { data: agencias } = await admin
    .from("agencies")
    .select("id, name, org_id")
    .ilike("name", nombreAgencia)
  const agencia = (agencias ?? [])[0] as any
  if (!agencia) throw new Error(`No existe la agencia "${nombreAgencia}"`)
  const orgId = agencia.org_id as string

  const { data: settings } = await (admin.from("financial_settings") as any)
    .select(
      "accounting_start_date, close_anticipos_clientes, close_anticipos_proveedores, close_ventas_sin_facturar, close_facturas_a_recibir"
    )
    .eq("org_id", orgId)
    .eq("agency_id", agencia.id)
    .maybeSingle()

  // La fecha de inicio contable sale de la configuración de la agencia. Se
  // puede pisar por parámetro solo para explorar escenarios antes de que la
  // agencia la haya elegido.
  const desde = arg("since", settings?.accounting_start_date ?? "")
  if (!desde) {
    console.log(
      `\nLa agencia "${agencia.name}" no tiene fecha de inicio contable configurada.\n` +
        `El cierre real la saltearía. Para explorar un escenario, pasá --since AAAA-MM-DD.\n`
    )
    return
  }

  const config = leerConfiguracion(settings)

  console.log(`\nAgencia: ${agencia.name}`)
  console.log(`Período: ${periodo} (corte al ${hasta})`)
  console.log(`Contabilidad desde: ${desde}`)
  console.log(
    `Ajustes activos: ${
      Object.entries(config)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ") || "ninguno"
    }\n`
  )

  const operaciones = await recolectarOperaciones(admin as any, {
    orgId,
    agencyId: agencia.id,
    hasta,
    desde,
  })
  console.log(`Operaciones en alcance: ${operaciones.length}`)
  if (operaciones.length === 0) return

  const plan = planificarCierre(operaciones, config)

  console.log(`\n=== ASIENTOS QUE SE GENERARÍAN: ${plan.ajustes.length} ===`)
  for (const [tipo, r] of Object.entries(plan.resumen)) {
    if (r.cantidad === 0) continue
    const totales = Object.entries(r.porMoneda)
      .map(([cur, monto]) => plata(monto, cur))
      .join("  |  ")
    console.log(`   ${tipo.padEnd(20)} ${String(r.cantidad).padStart(4)} asientos   ${totales}`)
  }

  const mayores = [...plan.ajustes].sort((a, b) => b.monto - a.monto).slice(0, 8)
  if (mayores.length > 0) {
    console.log(`\n   Los mayores:`)
    for (const a of mayores) {
      console.log(
        `      ${a.tipo.padEnd(20)} ${plata(a.monto, a.currency).padStart(22)}   ${a.concepto}`
      )
    }
  }

  console.log(`\n=== DATOS A REVISAR (NO se asientan): ${plan.anomalias.length} ===`)
  if (plan.anomalias.length === 0) {
    console.log(`   Ninguno.`)
  } else {
    for (const an of plan.anomalias.slice(0, 10)) {
      console.log(
        `   ${an.numero}  venta ${plata(an.venta, an.currency)} / cobrado ${plata(an.cobrado, an.currency)}`
      )
      console.log(`      ${an.motivo}`)
    }
    if (plan.anomalias.length > 10) {
      console.log(`   ... y ${plan.anomalias.length - 10} más.`)
    }
  }

  console.log(`\n--- Nada de esto se escribió. Es solo lectura. ---\n`)
}

main().catch((e) => {
  console.error("\nFALLÓ:", e.message)
  process.exit(1)
})
