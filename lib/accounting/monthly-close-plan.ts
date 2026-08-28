/**
 * Plan de cierre mensual — VIB-140 / VIB-141.
 *
 * QUÉ DECIDE ESTE MÓDULO
 * ----------------------
 * Dado cómo quedó una agencia al último día de un mes, qué asientos de ajuste
 * corresponden. Nada más: no lee la base, no escribe, no resuelve cuentas. Solo
 * criterio contable.
 *
 * Esa separación es deliberada. Los cuatro ajustes que genera son los que un
 * contador revisa uno por uno, y tienen que poder probarse contra los casos
 * incómodos —el cliente que pagó de más, la operación facturada a medias, el
 * operador que nunca mandó factura— sin levantar una base de datos.
 *
 * LOS CUATRO AJUSTES
 * ------------------
 *   - **Anticipo de cliente**: cobró más que lo vendido. Ese excedente no es
 *     una cuenta por cobrar con saldo negativo: es un pasivo, plata que se debe
 *     en servicios.
 *   - **Anticipo a proveedor**: se le pagó al operador más que lo que se le
 *     debe. Es un activo, no una deuda negativa.
 *   - **Venta sin facturar**: se devengó la venta pero falta el comprobante.
 *   - **Factura a recibir**: el costo está comprometido y el operador no mandó
 *     su factura.
 *
 * Los dos primeros son RECLASIFICACIONES: mueven saldo entre cuentas
 * patrimoniales sin tocar el resultado. Los dos últimos son CUENTAS DE ORDEN:
 * informan al pie sin tocar nada.
 *
 * En ningún caso el cierre inventa un ingreso o un gasto. Un cierre que cambia
 * el resultado del mes es un cierre mal hecho.
 *
 * POR QUÉ CADA AJUSTE ES OPCIONAL
 * -------------------------------
 * Cada agencia decide cuáles quiere, desde su configuración contable. No es
 * capricho: las cuentas de orden son informativas y hay contadores que no las
 * usan, mientras que la reclasificación de anticipos es prácticamente
 * obligatoria si la agencia cobra por adelantado. Que sea configurable evita
 * que la decisión la tomemos nosotros por todas las agencias.
 */
import { calcularAnticipoAProveedor, calcularAnticipoDeCliente, RECLASIFICACION } from "./advances"
import {
  calcularFacturaARecibir,
  calcularVentaSinFacturar,
  CUENTAS_DE_ORDEN,
} from "./order-accounts"

export type TipoDeAjuste =
  | "ANTICIPO_CLIENTE"
  | "ANTICIPO_PROVEEDOR"
  | "VENTA_SIN_FACTURAR"
  | "FACTURA_A_RECIBIR"

/** Qué ajustes genera esta agencia. Sale de su configuración contable. */
export interface ConfiguracionDeCierre {
  anticipos_clientes: boolean
  anticipos_proveedores: boolean
  ventas_sin_facturar: boolean
  facturas_a_recibir: boolean
}

export const CIERRE_POR_DEFECTO: ConfiguracionDeCierre = {
  // Los anticipos vienen prendidos porque sin ellos el balance muestra una
  // cuenta por cobrar con saldo acreedor, que es un error de exposición liso y
  // llano. Las cuentas de orden vienen apagadas porque son informativas y no
  // todos los contadores las usan.
  anticipos_clientes: true,
  anticipos_proveedores: true,
  ventas_sin_facturar: false,
  facturas_a_recibir: false,
}

/**
 * Cómo quedó una operación al cierre del período.
 *
 * Todos los importes de una misma operación vienen en SU moneda, ya
 * homogeneizados por el llamador. Mezclar monedas acá produciría anticipos
 * fantasma: restar dólares de pesos siempre da un número, y siempre está mal.
 */
export interface OperacionAlCierre {
  id: string
  numero: string
  /** Moneda de la venta. */
  currency: string
  /** Venta devengada, con los servicios adicionales si la agencia los cuenta. */
  ventaDevengada: number
  /** Cobrado al cliente, en la moneda de la venta. */
  cobrado: number
  /** Facturado al cliente, en la moneda de la venta. */
  facturado: number
  /** Moneda del costo, que puede diferir de la de la venta. */
  costCurrency: string
  /** Costo comprometido con operadores, en la moneda del costo. */
  costoComprometido: number
  /** Pagado a operadores, en la moneda del costo. */
  pagadoAOperadores: number
  /** Facturas de compra recibidas de operadores, en la moneda del costo. */
  facturasRecibidas: number
}

export interface AjustePlanificado {
  tipo: TipoDeAjuste
  operationId: string
  concepto: string
  monto: number
  currency: string
  /** Código del plan que va al Debe. */
  debe: string
  /** Código del plan que va al Haber. */
  haber: string
}

/** Los códigos de cuenta que cada tipo de ajuste mueve, Debe contra Haber. */
export const CUENTAS_DEL_AJUSTE: Record<TipoDeAjuste, { debe: string; haber: string }> = {
  // El excedente sale de Cuentas por Cobrar —se debita para cancelar el saldo
  // acreedor que quedó— y va a Anticipos de Clientes, que es pasivo.
  ANTICIPO_CLIENTE: {
    debe: RECLASIFICACION.CLIENTE.desde,
    haber: RECLASIFICACION.CLIENTE.hacia,
  },
  // Espejo del anterior: sale de Cuentas por Pagar y va a un activo.
  ANTICIPO_PROVEEDOR: {
    debe: RECLASIFICACION.PROVEEDOR.hacia,
    haber: RECLASIFICACION.PROVEEDOR.desde,
  },
  VENTA_SIN_FACTURAR: {
    debe: CUENTAS_DE_ORDEN.VENTA_SIN_FACTURAR.deudora,
    haber: CUENTAS_DE_ORDEN.VENTA_SIN_FACTURAR.acreedora,
  },
  FACTURA_A_RECIBIR: {
    debe: CUENTAS_DE_ORDEN.FACTURA_A_RECIBIR.deudora,
    haber: CUENTAS_DE_ORDEN.FACTURA_A_RECIBIR.acreedora,
  },
}

/** Los ajustes que corresponden a una operación. Puede devolver varios. */
export function planificarOperacion(
  op: OperacionAlCierre,
  config: ConfiguracionDeCierre
): AjustePlanificado[] {
  const ajustes: AjustePlanificado[] = []

  const agregar = (tipo: TipoDeAjuste, monto: number, currency: string, detalle: string) => {
    const cuentas = CUENTAS_DEL_AJUSTE[tipo]
    ajustes.push({
      tipo,
      operationId: op.id,
      concepto: `${detalle} — ${op.numero}`,
      monto,
      currency,
      debe: cuentas.debe,
      haber: cuentas.haber,
    })
  }

  if (config.anticipos_clientes) {
    const a = calcularAnticipoDeCliente({
      venta: op.ventaDevengada,
      pagadoEnMonedaDeLaDeuda: op.cobrado,
    })
    if (a.tipo) agregar("ANTICIPO_CLIENTE", a.monto, op.currency, "Anticipo de cliente")
  }

  if (config.anticipos_proveedores) {
    const a = calcularAnticipoAProveedor({
      costo: op.costoComprometido,
      pagadoEnMonedaDeLaDeuda: op.pagadoAOperadores,
    })
    if (a.tipo) agregar("ANTICIPO_PROVEEDOR", a.monto, op.costCurrency, "Anticipo a operador")
  }

  if (config.ventas_sin_facturar) {
    const o = calcularVentaSinFacturar({
      ventaDevengada: op.ventaDevengada,
      facturado: op.facturado,
    })
    if (o.tipo) agregar("VENTA_SIN_FACTURAR", o.monto, op.currency, "Venta pendiente de facturar")
  }

  if (config.facturas_a_recibir) {
    const o = calcularFacturaARecibir({
      costoComprometido: op.costoComprometido,
      facturasRecibidas: op.facturasRecibidas,
    })
    if (o.tipo) {
      agregar("FACTURA_A_RECIBIR", o.monto, op.costCurrency, "Factura de operador pendiente")
    }
  }

  return ajustes
}

export interface PlanDeCierre {
  ajustes: AjustePlanificado[]
  /** Cuántos ajustes de cada tipo, para mostrar el resultado sin recontar. */
  resumen: Record<TipoDeAjuste, { cantidad: number; porMoneda: Record<string, number> }>
}

/** El plan completo del período. */
export function planificarCierre(
  operaciones: OperacionAlCierre[],
  config: ConfiguracionDeCierre
): PlanDeCierre {
  const ajustes = operaciones.flatMap((op) => planificarOperacion(op, config))

  const resumen: PlanDeCierre["resumen"] = {
    ANTICIPO_CLIENTE: { cantidad: 0, porMoneda: {} },
    ANTICIPO_PROVEEDOR: { cantidad: 0, porMoneda: {} },
    VENTA_SIN_FACTURAR: { cantidad: 0, porMoneda: {} },
    FACTURA_A_RECIBIR: { cantidad: 0, porMoneda: {} },
  }

  for (const a of ajustes) {
    const r = resumen[a.tipo]
    r.cantidad += 1
    // Se totaliza POR MONEDA, nunca en un único número: sumar pesos con dólares
    // da una cifra que parece un total y no lo es.
    r.porMoneda[a.currency] = Math.round(((r.porMoneda[a.currency] ?? 0) + a.monto) * 100) / 100
  }

  return { ajustes, resumen }
}
