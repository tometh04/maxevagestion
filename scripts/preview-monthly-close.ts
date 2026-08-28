/**
 * Preview del cierre mensual — solo lectura, no escribe absolutamente nada.
 *
 * Muestra qué ajustes generaría el cierre de una agencia para un período, para
 * poder contrastarlos contra la realidad del negocio ANTES de que exista el
 * proceso que los escribe.
 *
 * Es la misma disciplina que atajó los errores del backfill: verificar que el
 * resultado se parece a un negocio real, no solo que balancea. Un cierre que
 * balancea perfectamente y dice que la mitad de los clientes pagó de más está
 * mal, y solo se nota mirando los números.
 *
 *   npx tsx scripts/preview-monthly-close.ts --agency "Rosario" --period 2026-07
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { convertPaymentAmount } from "../lib/operations/payment-conversion"
import {
  computeCustomerAdvanceInSaleCurrency,
  getServiceExtrasByOperation,
} from "../lib/accounting/operation-services-debt"
import { rangoDelPeriodo } from "../lib/accounting/accounting-periods"

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

async function traerTodo<T>(
  hacerQuery: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await hacerQuery(desde, desde + 999)
    if (error) throw error
    const pagina = data ?? []
    filas.push(...pagina)
    // PostgREST corta en 1000 sin avisar: la página incompleta es la única
    // señal fiable de que no hay más.
    if (pagina.length < 1000) return filas
  }
}

async function main() {
  const nombreAgencia = arg("agency")
  const periodo = arg("period")
  // Fecha de inicio contable: lo anterior pertenece al asiento de apertura, no
  // al cierre mensual. Es también lo que deja afuera las operaciones legacy
  // importadas, cuyo importe de venta no es confiable.
  const desdeContable = arg("since", "")
  const { hasta } = rangoDelPeriodo(periodo)

  const { data: agencias } = await admin
    .from("agencies")
    .select("id, name, org_id")
    .ilike("name", nombreAgencia)
  const agencia = (agencias ?? [])[0] as any
  if (!agencia) throw new Error(`No existe la agencia "${nombreAgencia}"`)

  const orgId = agencia.org_id as string
  console.log(`\nAgencia: ${agencia.name}`)
  console.log(`Período: ${periodo} (corte al ${hasta})\n`)

  // Operaciones vivas de la agencia. Se excluyen las canceladas: un ajuste
  // sobre una operación cancelada expondría un pasivo que no existe.
  const operaciones = await traerTodo<any>((d, h) =>
    admin
      .from("operations")
      .select("id, file_code, sale_amount_total, sale_currency, operator_cost_currency, status")
      .eq("org_id", orgId)
      .eq("agency_id", agencia.id)
      .neq("status", "CANCELLED")
      .gte("created_at", desdeContable || "1900-01-01")
      .range(d, h)
  )
  console.log(`Operaciones no canceladas: ${operaciones.length}`)
  if (operaciones.length === 0) return

  const ids = new Set(operaciones.map((o) => o.id))

  // Pagos del cliente hasta la fecha de corte. El neto resta las devoluciones:
  // sin eso, devolverle plata a un cliente aparecería como que pagó de más.
  const pagos = await traerTodo<any>((d, h) =>
    admin
      .from("payments")
      .select("operation_id, amount, currency, exchange_rate, amount_usd, direction, payer_type")
      .eq("org_id", orgId)
      .eq("status", "PAID")
      .lte("date_paid", hasta)
      .range(d, h)
  )

  const monedaDeVenta = new Map<string, string>()
  for (const o of operaciones) monedaDeVenta.set(o.id, o.sale_currency || "USD")

  const cobradoNeto = new Map<string, number>()
  const pagadoAOperador = new Map<string, number>()
  const monedaDeCosto = new Map<string, string>()
  for (const o of operaciones) monedaDeCosto.set(o.id, o.operator_cost_currency || o.sale_currency || "USD")

  for (const p of pagos) {
    if (!p.operation_id || !ids.has(p.operation_id)) continue

    if (p.payer_type === "CUSTOMER") {
      const cur = monedaDeVenta.get(p.operation_id)!
      const monto = convertPaymentAmount(p, cur)
      // INCOME suma, EXPENSE (devolución) resta. Es el "paidNet" de la fórmula
      // canónica de deuda.
      const signo = p.direction === "INCOME" ? 1 : -1
      cobradoNeto.set(p.operation_id, (cobradoNeto.get(p.operation_id) ?? 0) + signo * monto)
    } else if (p.payer_type === "OPERATOR" && p.direction === "EXPENSE") {
      const cur = monedaDeCosto.get(p.operation_id)!
      pagadoAOperador.set(
        p.operation_id,
        (pagadoAOperador.get(p.operation_id) ?? 0) + convertPaymentAmount(p, cur)
      )
    }
  }

  // Costo comprometido con operadores, solo el que está en la moneda de costo
  // de la operación (mismo criterio que el listado: no mezclar sin TC).
  const opPays = await traerTodo<any>((d, h) =>
    admin
      .from("operator_payments")
      .select("operation_id, amount, currency")
      .eq("org_id", orgId)
      .range(d, h)
  )
  const costoComprometido = new Map<string, number>()
  for (const op of opPays) {
    if (!op.operation_id || !ids.has(op.operation_id)) continue
    if ((op.currency || "USD") !== monedaDeCosto.get(op.operation_id)) continue
    costoComprometido.set(
      op.operation_id,
      (costoComprometido.get(op.operation_id) ?? 0) + (Number(op.amount) || 0)
    )
  }

  // Los servicios adicionales cuentan como venta solo si la agencia lo pidió.
  // Ignorarlos hace aparecer anticipos que no existen: el cliente pagó el
  // servicio, pero la venta contra la que se compara no lo incluye.
  const { data: flagRow } = await admin
    .from("organization_settings")
    .select("value")
    .eq("org_id", orgId)
    .eq("key", "features.include_services_in_sale_total")
    .maybeSingle()
  const incluirServicios = String((flagRow as any)?.value ?? "false") === "true"
  console.log(`Servicios adicionales cuentan como venta: ${incluirServicios ? "SÍ" : "no"}`)

  const serviciosPorOp = await getServiceExtrasByOperation(admin, operaciones as any, orgId)

  // ---- Anticipos de clientes ----
  const anticiposCliente: Array<{ file: string; monto: number; cur: string; venta: number; cobrado: number }> = []
  for (const o of operaciones) {
    const cur = monedaDeVenta.get(o.id)!
    const anticipo = computeCustomerAdvanceInSaleCurrency({
      saleBase: Number(o.sale_amount_total) || 0,
      serviceExtra: serviciosPorOp[o.id]?.saleExtra ?? 0,
      includeServices: incluirServicios,
      paidNet: cobradoNeto.get(o.id) ?? 0,
    })
    if (anticipo > 0) {
      anticiposCliente.push({
        file: o.file_code,
        monto: anticipo,
        cur,
        venta: Number(o.sale_amount_total) || 0,
        cobrado: cobradoNeto.get(o.id) ?? 0,
      })
    }
  }

  // ---- Anticipos a operadores ----
  const anticiposOperador: Array<{ file: string; monto: number; cur: string }> = []
  for (const o of operaciones) {
    const costo =
      (costoComprometido.get(o.id) ?? 0) +
      (incluirServicios ? serviciosPorOp[o.id]?.costExtra ?? 0 : 0)
    const pagado = pagadoAOperador.get(o.id) ?? 0
    const excedente = pagado - costo
    if (excedente >= 0.01) {
      anticiposOperador.push({
        file: o.file_code,
        monto: Math.round(excedente * 100) / 100,
        cur: monedaDeCosto.get(o.id)!,
      })
    }
  }

  const porMoneda = (filas: Array<{ monto: number; cur: string }>) => {
    const t: Record<string, number> = {}
    for (const f of filas) t[f.cur] = Math.round(((t[f.cur] ?? 0) + f.monto) * 100) / 100
    return t
  }

  console.log(`\n=== ANTICIPOS DE CLIENTES ===`)
  console.log(`Operaciones afectadas: ${anticiposCliente.length} de ${operaciones.length} (${((anticiposCliente.length / operaciones.length) * 100).toFixed(1)}%)`)
  for (const [cur, total] of Object.entries(porMoneda(anticiposCliente))) {
    console.log(`   Total: ${plata(total, cur)}`)
  }
  console.log(`   Los 10 mayores:`)
  for (const a of anticiposCliente.sort((x, y) => y.monto - x.monto).slice(0, 10)) {
    console.log(`      ${a.file}  ${plata(a.monto, a.cur)}   (venta ${a.venta.toFixed(2)}, cobrado ${a.cobrado.toFixed(2)})`)
  }

  console.log(`\n=== ANTICIPOS A OPERADORES ===`)
  console.log(`Operaciones afectadas: ${anticiposOperador.length} de ${operaciones.length} (${((anticiposOperador.length / operaciones.length) * 100).toFixed(1)}%)`)
  for (const [cur, total] of Object.entries(porMoneda(anticiposOperador))) {
    console.log(`   Total: ${plata(total, cur)}`)
  }
  console.log(`   Los 10 mayores:`)
  for (const a of anticiposOperador.sort((x, y) => y.monto - x.monto).slice(0, 10)) {
    console.log(`      ${a.file}  ${plata(a.monto, a.cur)}`)
  }

  console.log(`\n--- Nada de esto se escribió. Es solo lectura. ---\n`)
}

main().catch((e) => {
  console.error("\nFALLÓ:", e.message)
  process.exit(1)
})
