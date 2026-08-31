/**
 * Cuenta corriente — de dónde salen los movimientos.
 *
 * La aritmética vive en `current-account.ts`, que es pura. Acá está lo que lee
 * la base y traduce cada hecho del negocio a un renglón del extracto.
 *
 * TIENE QUE HABLAR EL MISMO IDIOMA QUE LA FICHA DEL CLIENTE
 * ---------------------------------------------------------
 * Cada cobro se convierte con `convertPaymentAmount`, que es la misma función
 * que alimenta el listado de operaciones. No es una elección estética: el 22% de
 * las operaciones con cobros tiene al menos uno en otra moneda, así que
 * cualquier criterio propio daría otro número y el extracto contradiría a la
 * pantalla que la agencia mira todos los días.
 *
 * POR QUÉ EL SALDO PUEDE DIFERIR IGUAL, Y ESTÁ BIEN
 * -------------------------------------------------
 * La ficha calcula la deuda **por operación y la clampea en cero**: una
 * operación pagada de más figura en cero, no en negativo. El extracto **netea**,
 * porque eso es lo que hace una cuenta corriente: si el cliente pagó de más en
 * un viaje, ese excedente se descuenta de lo que debe por otro.
 *
 * Medido sobre clientes reales de Lozada, la diferencia aparece en la mitad de
 * los casos y va de 4 a 180 en la moneda del extracto. Siempre en el mismo
 * sentido: el extracto es menor o igual que la ficha, nunca mayor.
 *
 * Las dos cifras son correctas y responden preguntas distintas. La ficha
 * contesta "cuánto falta cobrar de este viaje"; el extracto, "cuánto nos debe
 * esta persona en total".
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { convertPaymentAmount } from "../operations/payment-conversion"
import type { MovimientoDeCuenta } from "./current-account"

const PAGE = 1000

type MovimientoConMoneda = MovimientoDeCuenta & { currency: string }

async function traerTodo<T>(
  hacerQuery: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await hacerQuery(desde, desde + PAGE - 1)
    if (error) throw new Error(error.message)
    const pagina = data ?? []
    filas.push(...pagina)
    if (pagina.length < PAGE) return filas
  }
}

export interface ContextoCuentaCorriente {
  orgId: string
  /** Inclusive. Omitir para traer desde el principio. */
  desde?: string | null
  hasta?: string | null
}

/**
 * Los movimientos de la cuenta corriente de un cliente.
 *
 * La venta se registra a la fecha de creación de la operación, que es cuando la
 * agencia se compromete. Los cobros, a su fecha de pago.
 */
export async function movimientosDeCliente(
  supabase: SupabaseClient<any>,
  customerId: string,
  ctx: ContextoCuentaCorriente
): Promise<MovimientoConMoneda[]> {
  // La operación no tiene `customer_id`: el vínculo va por `operation_customers`
  // y un viaje puede tener varios pasajeros. La deuda es del titular —el que
  // figura con rol MAIN—, que es el mismo criterio que usa el resto del sistema
  // para resolver "el cliente de una operación". Los acompañantes viajan, no
  // pagan.
  //
  // `operation_customers.expected_amount` existe y permitiría repartir la venta
  // entre varios, pero está cargado en 8 filas de 2.575: en los hechos nadie lo
  // usa, y repartir por ahí dejaría casi todas las operaciones en cero.
  const vinculos = await traerTodo<any>((d, h) =>
    (supabase.from("operation_customers") as any)
      .select("operation_id")
      .eq("org_id", ctx.orgId)
      .eq("customer_id", customerId)
      .eq("role", "MAIN")
      .range(d, h)
  )

  const operationIds = Array.from(
    new Set(vinculos.map((v) => v.operation_id).filter(Boolean))
  ) as string[]
  if (operationIds.length === 0) return []

  const operaciones: any[] = []
  for (let i = 0; i < operationIds.length; i += 200) {
    const { data, error } = await (supabase.from("operations") as any)
      .select("id, file_code, sale_amount_total, sale_currency, created_at, status, destination")
      .eq("org_id", ctx.orgId)
      .neq("status", "CANCELLED")
      .in("id", operationIds.slice(i, i + 200))
    if (error) throw new Error(error.message)
    operaciones.push(...((data ?? []) as any[]))
  }
  if (operaciones.length === 0) return []

  const ids = new Set(operaciones.map((o) => o.id))
  const monedaDeVenta = new Map<string, string>()
  for (const o of operaciones) monedaDeVenta.set(o.id, o.sale_currency || "USD")

  const movimientos: MovimientoConMoneda[] = []

  for (const o of operaciones) {
    const monto = Number(o.sale_amount_total) || 0
    if (monto <= 0) continue
    const fecha = String(o.created_at).slice(0, 10)
    if (ctx.desde && fecha < ctx.desde) continue
    if (ctx.hasta && fecha > ctx.hasta) continue

    movimientos.push({
      fecha,
      tipo: "VENTA",
      detalle: o.destination ? `Venta — ${o.destination}` : "Venta de viaje",
      operacion: o.file_code,
      debe: monto,
      haber: 0,
      currency: monedaDeVenta.get(o.id)!,
    })
  }

  let pagosQuery = (supabase.from("payments") as any)
    .select(
      "operation_id, amount, currency, exchange_rate, amount_usd, direction, payer_type, date_paid, reference"
    )
    .eq("org_id", ctx.orgId)
    .eq("status", "PAID")
    .eq("payer_type", "CUSTOMER")

  const pagos = await traerTodo<any>((d, h) => {
    let q = pagosQuery.range(d, h)
    if (ctx.desde) q = q.gte("date_paid", ctx.desde)
    if (ctx.hasta) q = q.lte("date_paid", ctx.hasta)
    return q
  })

  for (const p of pagos) {
    if (!p.operation_id || !ids.has(p.operation_id)) continue
    const currency = monedaDeVenta.get(p.operation_id)!
    const monto = convertPaymentAmount(p, currency)
    if (monto <= 0) continue

    const op = operaciones.find((o) => o.id === p.operation_id)
    const esDevolucion = p.direction === "EXPENSE"

    movimientos.push({
      fecha: String(p.date_paid).slice(0, 10),
      // Una devolución vuelve a poner al cliente en deuda: le devolvimos plata
      // que ya había pagado.
      tipo: esDevolucion ? "DEVOLUCION" : "COBRO",
      detalle: esDevolucion ? "Devolución al cliente" : p.reference || "Cobro",
      operacion: op?.file_code ?? null,
      debe: esDevolucion ? monto : 0,
      haber: esDevolucion ? 0 : monto,
      currency,
    })
  }

  return movimientos
}

/**
 * Los movimientos de la cuenta corriente de un operador.
 *
 * El costo sale de `operator_payments`, que es la fuente de verdad de la deuda
 * con el operador, y no de `operations.operator_cost`: los dos difieren cuando
 * hubo pagos parciales o el costo cambió después.
 */
export async function movimientosDeOperador(
  supabase: SupabaseClient<any>,
  operatorId: string,
  ctx: ContextoCuentaCorriente
): Promise<MovimientoConMoneda[]> {
  const movimientos: MovimientoConMoneda[] = []

  const deudas = await traerTodo<any>((d, h) =>
    (supabase.from("operator_payments") as any)
      .select("id, operation_id, amount, currency, due_date, created_at, notes")
      .eq("org_id", ctx.orgId)
      .eq("operator_id", operatorId)
      .range(d, h)
  )

  const opIds = Array.from(
    new Set(deudas.map((x) => x.operation_id).filter(Boolean))
  ) as string[]

  const codigos = new Map<string, string>()
  if (opIds.length > 0) {
    for (let i = 0; i < opIds.length; i += 200) {
      const { data } = await (supabase.from("operations") as any)
        .select("id, file_code")
        .in("id", opIds.slice(i, i + 200))
      for (const o of (data ?? []) as any[]) codigos.set(o.id, o.file_code)
    }
  }

  for (const dd of deudas) {
    const monto = Number(dd.amount) || 0
    if (monto <= 0) continue
    const fecha = String(dd.created_at ?? dd.due_date).slice(0, 10)
    if (ctx.desde && fecha < ctx.desde) continue
    if (ctx.hasta && fecha > ctx.hasta) continue

    movimientos.push({
      fecha,
      tipo: "COSTO",
      detalle: dd.notes || "Costo de servicios",
      operacion: dd.operation_id ? codigos.get(dd.operation_id) ?? null : null,
      // El costo nos pone en deuda: va al Haber, porque es un pasivo nuestro.
      debe: 0,
      haber: monto,
      currency: dd.currency || "USD",
    })
  }

  const pagos = await traerTodo<any>((d, h) => {
    let q = (supabase.from("payments") as any)
      .select("operation_id, amount, currency, date_paid, reference, direction, payer_type")
      .eq("org_id", ctx.orgId)
      .eq("status", "PAID")
      .eq("payer_type", "OPERATOR")
      .eq("direction", "EXPENSE")
      .eq("operator_id", operatorId)
      .range(d, h)
    if (ctx.desde) q = q.gte("date_paid", ctx.desde)
    if (ctx.hasta) q = q.lte("date_paid", ctx.hasta)
    return q
  })

  for (const p of pagos) {
    const monto = Number(p.amount) || 0
    if (monto <= 0) continue
    movimientos.push({
      fecha: String(p.date_paid).slice(0, 10),
      tipo: "PAGO",
      detalle: p.reference || "Pago al operador",
      operacion: p.operation_id ? codigos.get(p.operation_id) ?? null : null,
      debe: monto,
      haber: 0,
      currency: p.currency || "USD",
    })
  }

  return movimientos
}
