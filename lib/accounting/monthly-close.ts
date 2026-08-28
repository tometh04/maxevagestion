/**
 * Cierre mensual — VIB-141.
 *
 * Junta el estado real de una agencia al último día de un mes, se lo pasa al
 * planificador y escribe los asientos de ajuste que resulten.
 *
 * QUÉ LO DISPARA
 * --------------
 * La configuración de la agencia, nunca un desarrollador. El cron diario lee
 * `monthly_close_day` y `auto_close_month` de `financial_settings` y cierra a
 * quien le toque; el contador que quiera adelantarse o recalcular lo hace desde
 * la pantalla. No hay ningún camino que dependa de que alguien corra un script.
 *
 * POR QUÉ LA FECHA DE INICIO CONTABLE ES INNEGOCIABLE
 * ---------------------------------------------------
 * Sin acotar por `accounting_start_date`, el cierre alcanza a las operaciones
 * importadas, cuyo importe de venta no es confiable. Medido en Lozada Rosario:
 * sobre todo el histórico saldrían 87 operaciones y USD 463.896 de anticipos;
 * acotando desde junio quedan 5 operaciones y USD 821. Lo viejo entra por el
 * asiento de apertura, como un número que el contador revisa, y no operación
 * por operación colándose en el balance.
 *
 * Por eso una agencia sin fecha de inicio no se cierra: se saltea.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { convertPaymentAmount } from "../operations/payment-conversion"
import { createJournalEntry, resolveAccountIds } from "./journal-entries"
import {
  getServiceExtrasByOperation,
  computeCustomerAdvanceInSaleCurrency,
} from "./operation-services-debt"
import { rangoDelPeriodo, puedeCerrar, type Periodo } from "./accounting-periods"
import {
  CIERRE_POR_DEFECTO,
  planificarCierre,
  type AjustePlanificado,
  type Anomalia,
  type ConfiguracionDeCierre,
  type OperacionAlCierre,
} from "./monthly-close-plan"

const FLAG_SERVICIOS = "features.include_services_in_sale_total"

/** Trae todas las filas paginando: PostgREST corta en 1000 sin avisar. */
async function traerTodo<T>(
  hacerQuery: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await hacerQuery(desde, desde + 999)
    if (error) throw error
    const pagina = data ?? []
    filas.push(...pagina)
    if (pagina.length < 1000) return filas
  }
}

export interface ContextoDeCierre {
  orgId: string
  agencyId: string
  /** Último día del período, inclusive. */
  hasta: string
  /** `financial_settings.accounting_start_date`. */
  desde: string
}

/**
 * El estado de cada operación de la agencia al cierre del período.
 *
 * Todas las sumas de dinero se hacen en la moneda de la operación usando
 * `convertPaymentAmount`, que es la MISMA función que alimenta el listado que
 * el cliente mira. Si acá se usara otro criterio, el cierre generaría anticipos
 * sobre operaciones que en pantalla figuran saldadas.
 */
export async function recolectarOperaciones(
  admin: SupabaseClient<any>,
  ctx: ContextoDeCierre
): Promise<OperacionAlCierre[]> {
  const operaciones = await traerTodo<any>((d, h) =>
    (admin.from("operations") as any)
      .select("id, file_code, sale_amount_total, sale_currency, operator_cost_currency")
      .eq("org_id", ctx.orgId)
      .eq("agency_id", ctx.agencyId)
      .neq("status", "CANCELLED")
      .gte("created_at", ctx.desde)
      .range(d, h)
  )
  if (operaciones.length === 0) return []

  const ids = new Set(operaciones.map((o) => o.id))
  const monedaVenta = new Map<string, string>()
  const monedaCosto = new Map<string, string>()
  for (const o of operaciones) {
    monedaVenta.set(o.id, o.sale_currency || "USD")
    monedaCosto.set(o.id, o.operator_cost_currency || o.sale_currency || "USD")
  }

  // Pagos hasta la fecha de corte. Un cierre de septiembre tiene que reflejar
  // cómo estaba el 30 de septiembre, no cómo está hoy.
  const pagos = await traerTodo<any>((d, h) =>
    (admin.from("payments") as any)
      .select("operation_id, amount, currency, exchange_rate, amount_usd, direction, payer_type")
      .eq("org_id", ctx.orgId)
      .eq("status", "PAID")
      .lte("date_paid", ctx.hasta)
      .range(d, h)
  )

  const cobradoNeto = new Map<string, number>()
  const pagadoAOperadores = new Map<string, number>()
  for (const p of pagos) {
    if (!p.operation_id || !ids.has(p.operation_id)) continue

    if (p.payer_type === "CUSTOMER") {
      // Neto: las devoluciones restan. Sin esto, devolverle plata a un cliente
      // aparecería como que pagó de más.
      const signo = p.direction === "INCOME" ? 1 : -1
      const monto = convertPaymentAmount(p, monedaVenta.get(p.operation_id)!)
      cobradoNeto.set(p.operation_id, (cobradoNeto.get(p.operation_id) ?? 0) + signo * monto)
    } else if (p.payer_type === "OPERATOR" && p.direction === "EXPENSE") {
      // Se filtra por payer_type y no solo por dirección: el listado de
      // operaciones no lo hace y termina contando las devoluciones a clientes
      // como pagos a operadores.
      const monto = convertPaymentAmount(p, monedaCosto.get(p.operation_id)!)
      pagadoAOperadores.set(p.operation_id, (pagadoAOperadores.get(p.operation_id) ?? 0) + monto)
    }
  }

  const opPays = await traerTodo<any>((d, h) =>
    (admin.from("operator_payments") as any)
      .select("operation_id, amount, currency")
      .eq("org_id", ctx.orgId)
      .range(d, h)
  )
  const costoComprometido = new Map<string, number>()
  for (const op of opPays) {
    if (!op.operation_id || !ids.has(op.operation_id)) continue
    // Mismo criterio que el listado: no mezclar monedas sin tipo de cambio.
    if ((op.currency || "USD") !== monedaCosto.get(op.operation_id)) continue
    costoComprometido.set(
      op.operation_id,
      (costoComprometido.get(op.operation_id) ?? 0) + (Number(op.amount) || 0)
    )
  }

  const facturado = await traerTodo<any>((d, h) =>
    (admin.from("invoices") as any)
      .select("operation_id, imp_total, moneda, cotizacion")
      .eq("org_id", ctx.orgId)
      .eq("status", "authorized")
      .lte("fecha_emision", ctx.hasta)
      .range(d, h)
  )
  const facturadoPorOp = new Map<string, number>()
  for (const f of facturado) {
    if (!f.operation_id || !ids.has(f.operation_id)) continue
    const destino = monedaVenta.get(f.operation_id)!
    const monto = convertPaymentAmount(
      { amount: f.imp_total, currency: f.moneda === "DOL" ? "USD" : "ARS", exchange_rate: f.cotizacion },
      destino
    )
    facturadoPorOp.set(f.operation_id, (facturadoPorOp.get(f.operation_id) ?? 0) + monto)
  }

  const compras = await traerTodo<any>((d, h) =>
    (admin.from("purchase_invoices") as any)
      .select("operation_id, total_amount, currency")
      .eq("org_id", ctx.orgId)
      .lte("invoice_date", ctx.hasta)
      .range(d, h)
  ).catch(() => [] as any[])
  const comprasPorOp = new Map<string, number>()
  for (const c of compras) {
    if (!c.operation_id || !ids.has(c.operation_id)) continue
    if ((c.currency || "USD") !== monedaCosto.get(c.operation_id)) continue
    comprasPorOp.set(c.operation_id, (comprasPorOp.get(c.operation_id) ?? 0) + (Number(c.total_amount) || 0))
  }

  // Los servicios adicionales cuentan como venta solo si la agencia lo pidió.
  // Ignorarlos inventa anticipos: el cliente pagó el servicio pero la venta
  // contra la que se compara no lo incluye.
  const { data: flagRow } = await (admin.from("organization_settings") as any)
    .select("value")
    .eq("org_id", ctx.orgId)
    .eq("key", FLAG_SERVICIOS)
    .maybeSingle()
  const incluirServicios = String(flagRow?.value ?? "false") === "true"
  const servicios = await getServiceExtrasByOperation(admin, operaciones as any, ctx.orgId)

  return operaciones.map((o) => {
    const extraVenta = incluirServicios ? servicios[o.id]?.saleExtra ?? 0 : 0
    const extraCosto = incluirServicios ? servicios[o.id]?.costExtra ?? 0 : 0
    return {
      id: o.id,
      numero: o.file_code || o.id.slice(0, 8),
      currency: monedaVenta.get(o.id)!,
      ventaDevengada: (Number(o.sale_amount_total) || 0) + extraVenta,
      cobrado: cobradoNeto.get(o.id) ?? 0,
      facturado: facturadoPorOp.get(o.id) ?? 0,
      costCurrency: monedaCosto.get(o.id)!,
      costoComprometido: (costoComprometido.get(o.id) ?? 0) + extraCosto,
      pagadoAOperadores: pagadoAOperadores.get(o.id) ?? 0,
      facturasRecibidas: comprasPorOp.get(o.id) ?? 0,
    }
  })
}

export interface ResultadoDeCierre {
  agencyId: string
  periodo: Periodo
  /** Por qué no se hizo nada, si no se hizo nada. */
  omitido?: string
  asientosCreados: number
  asientosBorrados: number
  anomalias: Anomalia[]
  resumen?: ReturnType<typeof planificarCierre>["resumen"]
}

/** Lee la configuración de cierre de la agencia. */
export function leerConfiguracion(settings: any): ConfiguracionDeCierre {
  if (!settings) return CIERRE_POR_DEFECTO
  return {
    anticipos_clientes: settings.close_anticipos_clientes ?? CIERRE_POR_DEFECTO.anticipos_clientes,
    anticipos_proveedores:
      settings.close_anticipos_proveedores ?? CIERRE_POR_DEFECTO.anticipos_proveedores,
    ventas_sin_facturar:
      settings.close_ventas_sin_facturar ?? CIERRE_POR_DEFECTO.ventas_sin_facturar,
    facturas_a_recibir: settings.close_facturas_a_recibir ?? CIERRE_POR_DEFECTO.facturas_a_recibir,
  }
}

export interface EjecutarCierreParams {
  orgId: string
  agencyId: string
  periodo: Periodo
  hoy: string
  /** Quién lo pidió. NULL cuando lo dispara el cron. */
  userId?: string | null
  /** Calcula e informa, pero no escribe. */
  simular?: boolean
}

/**
 * Genera los ajustes de cierre de una agencia para un período.
 *
 * Es idempotente por diseño: primero borra los ajustes que ya existían para ese
 * período y los vuelve a crear. Recalcular es la operación normal mientras el
 * período esté abierto, porque un contable que corrige una factura el día 3
 * tiene que poder regenerar el ajuste sin pedirle nada a nadie.
 *
 * Borrar y recrear es seguro justamente porque estos asientos no son hechos:
 * son una foto del estado al cierre. No hay información que se pierda al
 * recalcularlos, a diferencia de un cobro o un pago.
 */
export async function ejecutarCierre(
  admin: SupabaseClient<any>,
  params: EjecutarCierreParams
): Promise<ResultadoDeCierre> {
  const { orgId, agencyId, periodo, hoy } = params
  const base: ResultadoDeCierre = {
    agencyId,
    periodo,
    asientosCreados: 0,
    asientosBorrados: 0,
    anomalias: [],
  }

  const { data: settings } = await (admin.from("financial_settings") as any)
    .select(
      "accounting_start_date, close_anticipos_clientes, close_anticipos_proveedores, close_ventas_sin_facturar, close_facturas_a_recibir"
    )
    .eq("org_id", orgId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (!settings?.accounting_start_date) {
    return { ...base, omitido: "La agencia todavía no configuró su fecha de inicio contable." }
  }

  const { data: periodoRow } = await (admin.from("accounting_periods") as any)
    .select("status")
    .eq("org_id", orgId)
    .eq("agency_id", agencyId)
    .eq("period", periodo)
    .maybeSingle()

  const permitido = puedeCerrar(periodo, hoy, periodoRow?.status ?? null)
  if (!permitido.puede) return { ...base, omitido: permitido.motivo }

  const { hasta } = rangoDelPeriodo(periodo)
  const operaciones = await recolectarOperaciones(admin, {
    orgId,
    agencyId,
    hasta,
    desde: settings.accounting_start_date,
  })

  const plan = planificarCierre(operaciones, leerConfiguracion(settings))
  if (params.simular) {
    return { ...base, anomalias: plan.anomalias, resumen: plan.resumen }
  }

  // Recalcular: los ajustes previos del período se van y se rehacen.
  const { data: previos } = await (admin.from("journal_entries") as any)
    .select("id")
    .eq("org_id", orgId)
    .eq("agency_id", agencyId)
    .eq("close_period", periodo)

  const idsPrevios = ((previos ?? []) as any[]).map((r) => r.id)
  if (idsPrevios.length > 0) {
    // Las líneas primero: son las que cuelgan del asiento.
    await (admin.from("ledger_movements") as any).delete().in("journal_entry_id", idsPrevios)
    await (admin.from("journal_entries") as any).delete().in("id", idsPrevios)
  }

  // Las cuentas se resuelven una sola vez: son cuatro códigos fijos, no uno por
  // operación. Resolverlas dentro del bucle haría una query por cada ajuste.
  const codigos = Array.from(new Set(plan.ajustes.flatMap((a) => [a.debe, a.haber])))
  const cuentas = codigos.length > 0 ? await resolveAccountIds(codigos, admin as any, orgId) : {}

  let creados = 0
  for (const ajuste of plan.ajustes) {
    const debeId = cuentas[ajuste.debe]
    const haberId = cuentas[ajuste.haber]
    if (!debeId || !haberId) {
      // Sin las dos cuentas no se arma medio asiento. Se informa como anomalía
      // en vez de dejar un desbalance.
      plan.anomalias.push({
        operationId: ajuste.operationId,
        numero: ajuste.concepto,
        motivo: `Faltan cuentas del plan (${ajuste.debe} o ${ajuste.haber}).`,
        venta: 0,
        cobrado: 0,
        currency: ajuste.currency,
      })
      continue
    }

    await createJournalEntry(
      {
        entry_date: hasta,
        description: ajuste.concepto,
        source: "AUTO_CONFIRMATION",
        currency: ajuste.currency as "ARS" | "USD",
        operation_id: ajuste.operationId,
        org_id: orgId,
        agency_id: agencyId,
        close_period: periodo,
        close_kind: ajuste.tipo,
        created_by: params.userId ?? null,
        lines: [
          { chart_account_id: debeId, debit_amount: ajuste.monto, concept: ajuste.concepto },
          { chart_account_id: haberId, credit_amount: ajuste.monto, concept: ajuste.concepto },
        ] as any,
      },
      admin as any
    )
    creados += 1
  }

  await (admin.from("accounting_periods") as any).upsert(
    {
      org_id: orgId,
      agency_id: agencyId,
      period: periodo,
      status: "OPEN",
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "org_id,agency_id,period" }
  )

  return {
    ...base,
    asientosCreados: creados,
    asientosBorrados: idsPrevios.length,
    anomalias: plan.anomalias,
    resumen: plan.resumen,
  }
}
