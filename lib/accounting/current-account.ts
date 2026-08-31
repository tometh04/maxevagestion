/**
 * Cuenta corriente de clientes y operadores.
 *
 * QUÉ ES Y POR QUÉ FALTABA
 * ------------------------
 * vibook sabe cuánto debe cada cliente y cuánto se le debe a cada operador,
 * pero solo como saldo: un número. Lo que no había es el **extracto**, o sea la
 * sucesión de movimientos con el saldo corrido al lado.
 *
 * Es lo que un contador manda cuando alguien discute una deuda, y lo que Aptour
 * lista entre sus prestaciones. Un saldo sin extracto obliga a contestar "te
 * debemos ochocientos dólares" sin poder mostrar de dónde salen.
 *
 * UN EXTRACTO POR MONEDA
 * ----------------------
 * Nunca mezcladas. Un cliente que compró en dólares y pagó parte en pesos tiene
 * dos historias distintas, y sumarlas daría un saldo que no se le puede
 * reclamar a nadie.
 *
 * EL SIGNO, EXPLICADO UNA VEZ
 * ---------------------------
 * El extracto se escribe desde el punto de vista de la agencia:
 *
 *   - **Cliente**: la venta lo pone en deuda (Debe), el cobro la cancela
 *     (Haber). Una devolución vuelve a ponerlo en deuda, porque le devolvimos
 *     plata que ya había pagado.
 *   - **Operador**: el costo nos pone en deuda con él (Haber, porque es un
 *     pasivo nuestro), y el pago la cancela (Debe).
 *
 * Por eso el saldo de un cliente es deudor y el de un operador acreedor, y el
 * extracto lo dice explícitamente en vez de dejarlo a interpretación.
 */

const redondear = (n: number) => Math.round(n * 100) / 100

export type TipoDeContraparte = "CLIENTE" | "OPERADOR"

export type TipoDeMovimiento =
  | "VENTA"
  | "COBRO"
  | "DEVOLUCION"
  | "COSTO"
  | "PAGO"
  | "AJUSTE"

export interface MovimientoDeCuenta {
  fecha: string
  tipo: TipoDeMovimiento
  detalle: string
  /** Código de la operación, para poder rastrear el movimiento. */
  operacion?: string | null
  debe: number
  haber: number
}

export interface RenglonDelExtracto extends MovimientoDeCuenta {
  /** Saldo después de este movimiento. */
  saldo: number
}

export interface CuentaCorriente {
  currency: string
  tipo: TipoDeContraparte
  renglones: RenglonDelExtracto[]
  totalDebe: number
  totalHaber: number
  /**
   * Saldo final. Positivo significa que la contraparte nos debe; negativo, que
   * le debemos. Es la misma convención para clientes y operadores, para que un
   * número negativo signifique siempre lo mismo.
   */
  saldoFinal: number
}

/**
 * Ordena los movimientos y calcula el saldo corrido.
 *
 * El orden es cronológico. Dentro del mismo día va primero lo que genera deuda
 * y después lo que la cancela: si un cliente compra y paga el mismo día, el
 * extracto tiene que mostrar la venta antes que el cobro, porque al revés el
 * saldo pasaría por un negativo que nunca existió.
 */
export function armarCuentaCorriente(
  movimientos: MovimientoDeCuenta[],
  currency: string,
  tipo: TipoDeContraparte
): CuentaCorriente {
  const ordenados = [...movimientos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    // Lo que suma al Debe primero. Un empate real se resuelve por detalle, para
    // que dos corridas del mismo extracto den el mismo orden.
    const ladoA = a.debe > 0 ? 0 : 1
    const ladoB = b.debe > 0 ? 0 : 1
    if (ladoA !== ladoB) return ladoA - ladoB
    return a.detalle.localeCompare(b.detalle)
  })

  let saldo = 0
  const renglones: RenglonDelExtracto[] = ordenados.map((m) => {
    saldo = redondear(saldo + (Number(m.debe) || 0) - (Number(m.haber) || 0))
    return { ...m, saldo }
  })

  return {
    currency,
    tipo,
    renglones,
    totalDebe: redondear(ordenados.reduce((t, m) => t + (Number(m.debe) || 0), 0)),
    totalHaber: redondear(ordenados.reduce((t, m) => t + (Number(m.haber) || 0), 0)),
    saldoFinal: saldo,
  }
}

/**
 * Agrupa los movimientos por moneda y arma un extracto de cada una.
 *
 * Las monedas se devuelven ordenadas para que dos consultas del mismo extracto
 * las muestren siempre en el mismo orden.
 */
export function armarCuentasPorMoneda(
  movimientos: Array<MovimientoDeCuenta & { currency: string }>,
  tipo: TipoDeContraparte
): CuentaCorriente[] {
  const porMoneda = new Map<string, MovimientoDeCuenta[]>()
  for (const m of movimientos) {
    const lista = porMoneda.get(m.currency) ?? []
    lista.push(m)
    porMoneda.set(m.currency, lista)
  }

  return Array.from(porMoneda.keys())
    .sort()
    .map((currency) => armarCuentaCorriente(porMoneda.get(currency)!, currency, tipo))
}
