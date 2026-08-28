/**
 * Cuentas de orden — VIB-140 (C2 y C3).
 *
 * Registran compromisos que un contador necesita ver pero que no son todavía
 * activo, pasivo ni resultado:
 *
 *   - **C2, ventas pendientes de facturar**: la agencia vendió y hasta cobró,
 *     pero no emitió la factura. La venta ya está devengada y registrada como
 *     tal; lo que falta es el comprobante.
 *   - **C3, facturas a recibir de operadores**: el costo está comprometido y a
 *     veces pagado, pero el operador no mandó su factura. Importa fiscalmente,
 *     porque es costo computado sin respaldo documental.
 *
 * VAN DE A PARES, Y ESO NO ES UN DETALLE
 * --------------------------------------
 * Cada cuenta de orden tiene su contrapartida, deudora contra acreedora, para
 * que se cancelen entre sí y NO distorsionen el balance. Se presentan al pie.
 * Por eso las dos líneas del asiento van a cuentas de orden y ninguna toca el
 * Activo, el Pasivo ni el Resultado.
 *
 * LO QUE NO HAY QUE DUPLICAR
 * --------------------------
 * El pasivo con el operador YA está registrado en Cuentas por Pagar desde que
 * se confirma la operación. La cuenta de orden no lo repite: informa que ese
 * pasivo no tiene factura de respaldo, que es otra cosa.
 *
 * Lo mismo del lado de la venta: el ingreso ya está en Ventas de Viajes. La
 * cuenta de orden informa que falta el comprobante.
 */

const UMBRAL = 0.01
const redondear = (n: number) => Math.round(n * 100) / 100

export type TipoOrden = "VENTA_SIN_FACTURAR" | "FACTURA_A_RECIBIR"

export interface PartidaDeOrden {
  monto: number
  tipo: TipoOrden | null
}

/** Códigos del plan, por tipo. La deudora y su contrapartida acreedora. */
export const CUENTAS_DE_ORDEN = {
  VENTA_SIN_FACTURAR: { deudora: "5.1.01", acreedora: "5.2.01" },
  FACTURA_A_RECIBIR: { deudora: "5.1.02", acreedora: "5.2.02" },
} as const

export interface VentaSinFacturarParams {
  /** Venta devengada de la operación, incluidos los servicios adicionales. */
  ventaDevengada: number
  /** Total ya facturado de esa operación, en la MISMA moneda. */
  facturado: number
}

/**
 * C2 — Lo vendido que todavía no se facturó.
 *
 * Ojo con el input: `ventaDevengada` tiene que incluir los servicios
 * adicionales solo si la agencia los cuenta en la venta
 * (`features.include_services_in_sale_total`). Si no, sumarlos acá haría
 * aparecer como "pendiente de facturar" algo que la agencia no considera venta.
 * Por eso el cálculo recibe el total ya resuelto y no lo arma solo.
 */
export function calcularVentaSinFacturar(p: VentaSinFacturarParams): PartidaDeOrden {
  const pendiente = (Number(p.ventaDevengada) || 0) - (Number(p.facturado) || 0)
  if (pendiente < UMBRAL) return { monto: 0, tipo: null }
  return { monto: redondear(pendiente), tipo: "VENTA_SIN_FACTURAR" }
}

export interface FacturaARecibirParams {
  /** Costo comprometido con el operador, en su moneda. */
  costoComprometido: number
  /** Facturas de compra recibidas de ese operador, en la MISMA moneda. */
  facturasRecibidas: number
}

/**
 * C3 — Costo comprometido sin factura del operador.
 *
 * No duplica el pasivo: la deuda con el operador ya vive en Cuentas por Pagar.
 * Esto informa que esa deuda no tiene comprobante de respaldo.
 */
export function calcularFacturaARecibir(p: FacturaARecibirParams): PartidaDeOrden {
  const pendiente = (Number(p.costoComprometido) || 0) - (Number(p.facturasRecibidas) || 0)
  if (pendiente < UMBRAL) return { monto: 0, tipo: null }
  return { monto: redondear(pendiente), tipo: "FACTURA_A_RECIBIR" }
}

/**
 * Las dos líneas del asiento de orden: la deudora y su contrapartida.
 *
 * Siempre balancean y siempre quedan dentro de la familia 5, así que no pueden
 * afectar el Activo, el Pasivo ni el Resultado.
 */
export function lineasDeOrden(
  tipo: TipoOrden,
  monto: number,
  cuentas: Record<string, string>,
  concepto: string
) {
  const mapa = CUENTAS_DE_ORDEN[tipo]
  const deudoraId = cuentas[mapa.deudora]
  const acreedoraId = cuentas[mapa.acreedora]
  if (!deudoraId || !acreedoraId) return null

  return [
    {
      chart_account_id: deudoraId,
      debit_amount: monto,
      concept: concepto,
      legacy_type: "INCOME" as const,
    },
    {
      chart_account_id: acreedoraId,
      credit_amount: monto,
      concept: concepto,
      legacy_type: "INCOME" as const,
    },
  ]
}
