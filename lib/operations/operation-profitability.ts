/**
 * Rentabilidad de UNA operación: de la venta a la ganancia neta.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * El cálculo vivía dentro de la pestaña "Métricas" del detalle de operación, y
 * ahí se rompió de dos maneras a la vez:
 *
 *   1. Restaba la comisión del vendedor pero NO la del referidor, y al número
 *      lo llamaba "Ganancia Neta". Reportado por Lozada: una venta con margen
 *      USD 1.217,88 mostraba ~USD 1.035 cuando lo real eran USD 825,69.
 *   2. Cuando la operación no tenía comisión calculada, caía a un 10%
 *      hardcodeado: descontaba una comisión que no existía.
 *
 * Los dos son errores de dominio, no de presentación, así que el cálculo baja
 * acá y se prueba sin levantar un componente.
 *
 * LO QUE NO HACE, A PROPÓSITO
 * ---------------------------
 * No convierte monedas. Si la comisión del referidor está en otra moneda que la
 * operación, la devuelve en `referidorEnOtraMoneda` en vez de valuarla con un
 * tipo de cambio que esta pantalla no tiene. Un número convertido con un TC
 * inventado es peor que un aviso.
 */

/** Servicio adicional de la operación, en la moneda que sea. */
export interface ServicioDeOperacion {
  sale_amount: number
  cost_amount: number
  sale_currency: string
  cost_currency: string
  generates_commission: boolean
}

export interface ComisionReferidor {
  amount: number
  currency: string
  status: string
  partnerName?: string | null
}

export interface EntradaRentabilidad {
  saleAmount: number
  operatorCost: number
  /** Moneda de la operación. Los servicios en otra moneda no se mezclan. */
  currency: string
  /** Porcentaje del vendedor. `null` = todavía no hay comisión calculada. */
  commissionPercent: number | null
  referralCommission?: ComisionReferidor | null
  servicios?: ServicioDeOperacion[]
}

export interface Rentabilidad {
  venta: number
  costo: number
  margen: number
  margenPct: number
  comisionVendedor: number
  comisionReferidor: number
  comisiones: number
  ganancia: number
  gananciaPct: number
  /** Hay comisión de referidor viva que no se pudo restar por ser otra moneda. */
  referidorEnOtraMoneda: boolean
  /** Nombre del referidor, para poder nombrarlo en el desglose. */
  referidorNombre: string | null
}

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0)

/**
 * Una comisión de referidor solo se descuenta si se va a pagar y si está en la
 * misma moneda que la operación. `CANCELLED` no se paga.
 */
function referidorDescontable(
  referral: ComisionReferidor | null | undefined,
  currency: string
): { monto: number; enOtraMoneda: boolean; nombre: string | null } {
  if (!referral || !(referral.amount > 0) || referral.status === "CANCELLED") {
    return { monto: 0, enOtraMoneda: false, nombre: null }
  }
  if (referral.currency !== currency) {
    return { monto: 0, enOtraMoneda: true, nombre: referral.partnerName ?? null }
  }
  return { monto: referral.amount, enOtraMoneda: false, nombre: referral.partnerName ?? null }
}

export function calcularRentabilidad(entrada: EntradaRentabilidad): Rentabilidad {
  const { saleAmount, operatorCost, currency, commissionPercent } = entrada
  const servicios = entrada.servicios ?? []

  // Solo los servicios en la moneda de la operación entran al total: sumar
  // pesos con dólares daría una cifra que parece un total y no lo es.
  const mismaMoneda = servicios.filter(
    (s) => s.sale_currency === currency && s.cost_currency === currency
  )
  const ventaServicios = mismaMoneda.reduce((acc, s) => acc + Number(s.sale_amount), 0)
  const costoServicios = mismaMoneda.reduce((acc, s) => acc + Number(s.cost_amount), 0)

  const venta = saleAmount + ventaServicios
  const costo = operatorCost + costoServicios
  const margen = venta - costo

  // Sin porcentaje conocido la comisión es 0, nunca un valor por defecto.
  const tasa = (commissionPercent ?? 0) / 100
  const comisionServicios = mismaMoneda
    .filter((s) => s.generates_commission)
    .reduce((acc, s) => acc + (Number(s.sale_amount) - Number(s.cost_amount)) * tasa, 0)
  const comisionVendedor = (saleAmount - operatorCost) * tasa + comisionServicios

  const ref = referidorDescontable(entrada.referralCommission, currency)

  const comisiones = comisionVendedor + ref.monto
  const ganancia = margen - comisiones

  return {
    venta,
    costo,
    margen,
    margenPct: pct(margen, venta),
    comisionVendedor,
    comisionReferidor: ref.monto,
    comisiones,
    ganancia,
    gananciaPct: pct(ganancia, venta),
    referidorEnOtraMoneda: ref.enOtraMoneda,
    referidorNombre: ref.nombre,
  }
}
