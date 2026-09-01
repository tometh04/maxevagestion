/**
 * Totalización de comisiones a referidores para los reportes de resultado.
 *
 * POR QUÉ EXISTE
 * --------------
 * Dos reportes tenían que restar la comisión del referidor y ninguno la
 * restaba: Contabilidad → Ganancias (base del impuesto trimestral) y el Cierre
 * de Mes viejo. Los dos leían sólo `commission_records` (vendedores) y, del
 * ledger, sólo `type = 'EXPENSE'` — y la liquidación al referidor se registra
 * como `type = 'COMMISSION'`, así que se escapaba por los dos caminos. El
 * resultado mostraba como ganancia plata ya comprometida con un tercero.
 *
 * La suma vive acá y no en cada ruta porque las dos decisiones que tiene —qué
 * fila cuenta y en qué balde de moneda cae— son criterio, y equivocarse en
 * cualquiera de las dos mueve un número fiscal sin que nada falle.
 *
 * EL BALDE DE MONEDA ES EL DE LA OPERACIÓN, NO EL DE LA FILA
 * ----------------------------------------------------------
 * `referral_commissions` tiene columna `currency` propia y aun así no se usa
 * para agrupar. El invariante de estos reportes es que el ingreso y su comisión
 * caigan del mismo lado: si el margen se agrupa por `sale_currency` y la
 * comisión por la suya, una operación con las dos distintas manda el ingreso a
 * un balde y su costo al otro. Es exactamente el error que ya se corrigió para
 * las comisiones de vendedores.
 */

export type ReferralCurrency = "ARS" | "USD"

export interface ReferralTotals {
  ars: number
  usd: number
}

export interface ReferralCommissionLike {
  amount: number | string | null
  status?: string | null
}

/**
 * Una comisión anulada no se paga, así que no es costo del período.
 *
 * `PENDING` sí cuenta: es plata devengada y comprometida. Mostrarla como
 * ganancia hasta que se liquide es justamente lo que hacía inflar el número.
 */
export function cuentaComoCosto(status: string | null | undefined): boolean {
  return status !== "CANCELLED"
}

/**
 * Suma las comisiones de referidor separadas por moneda.
 *
 * `monedaDe` recibe la fila y devuelve la moneda de SU operación. Devolver
 * `undefined` cae a ARS, que es el default defensivo del resto del módulo.
 */
export function sumarReferidosPorMoneda<T extends ReferralCommissionLike>(
  rows: T[] | null | undefined,
  monedaDe: (row: T) => ReferralCurrency | undefined | null
): ReferralTotals {
  const totals: ReferralTotals = { ars: 0, usd: 0 }

  for (const row of rows ?? []) {
    if (!cuentaComoCosto(row.status)) continue
    const amount = Number(row.amount) || 0
    if (amount === 0) continue
    if (monedaDe(row) === "USD") totals.usd += amount
    else totals.ars += amount
  }

  return totals
}
