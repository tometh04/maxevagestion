/**
 * Anticipos de clientes y a proveedores — VIB-140 (C1).
 *
 * QUÉ RESUELVE
 * ------------
 * Hoy, si un cliente paga más de lo que debe, ese excedente **desaparece**: la
 * fórmula de la deuda hace `Math.max(0, venta − pagado)`, así que el sobrante
 * se recorta y no queda registrado en ninguna parte.
 *
 * Contablemente eso está mal. Un cobro por encima de la deuda no es una venta:
 * es un PASIVO. La agencia le debe al cliente un servicio o la devolución. Lo
 * mismo del otro lado: pagarle a un operador más de lo que se le debe es un
 * ACTIVO, porque el operador le debe servicio a la agencia.
 *
 * Las cuentas existen en el plan de las seis agencias y están huérfanas:
 * `2.1.07` Anticipos de Clientes y `1.1.06` Anticipos a Proveedores.
 *
 * CÓMO SE DETECTA
 * ---------------
 * Comparando en la MONEDA DE LA DEUDA, no en la de cada cobro. Un cliente puede
 * pagar en pesos una deuda en dólares, y sumar importes de distinta moneda da
 * cualquier cosa: midiéndolo mal, Lozada aparentaba tener ARS 325 millones de
 * anticipos a proveedores que en realidad eran pagos en pesos contra costos en
 * dólares.
 *
 * Por eso el input es `pagadoEnMonedaDeLaDeuda`, que es lo que ya calcula la
 * capa operativa con la cotización de cada pago.
 *
 * CÓMO SE REGISTRA
 * ----------------
 * Como una RECLASIFICACIÓN, que es lo que haría un contador al cierre: el saldo
 * acreedor de Cuentas por Cobrar se pasa a Anticipos de Clientes. No se toca el
 * asiento del cobro, que ya está bien: se corrige dónde queda parado el saldo.
 */

export type TipoAnticipo = "CLIENTE" | "PROVEEDOR"

export interface Anticipo {
  /** Importe del anticipo, en la moneda de la deuda. Siempre positivo. */
  monto: number
  tipo: TipoAnticipo | null
}

/** Menos de un centavo es redondeo, no un anticipo. */
const UMBRAL = 0.01

const redondear = (n: number) => Math.round(n * 100) / 100

export interface AnticipoClienteParams {
  /** Total de la venta, en su moneda. */
  venta: number
  /** Lo cobrado neto (cobros menos devoluciones), en la MISMA moneda. */
  pagadoEnMonedaDeLaDeuda: number
}

/**
 * Anticipo de un cliente: lo que pagó por encima de lo que debía.
 *
 * Devuelve tipo null cuando no hay anticipo, que es el caso normal.
 */
export function calcularAnticipoDeCliente(p: AnticipoClienteParams): Anticipo {
  const excedente = (Number(p.pagadoEnMonedaDeLaDeuda) || 0) - (Number(p.venta) || 0)
  if (excedente < UMBRAL) return { monto: 0, tipo: null }
  return { monto: redondear(excedente), tipo: "CLIENTE" }
}

export interface AnticipoProveedorParams {
  /** Costo comprometido con el operador, en su moneda. */
  costo: number
  /** Lo pagado al operador, en la MISMA moneda. */
  pagadoEnMonedaDeLaDeuda: number
}

/**
 * Anticipo a un proveedor: lo que se le pagó por encima de lo que se le debía.
 */
export function calcularAnticipoAProveedor(p: AnticipoProveedorParams): Anticipo {
  const excedente = (Number(p.pagadoEnMonedaDeLaDeuda) || 0) - (Number(p.costo) || 0)
  if (excedente < UMBRAL) return { monto: 0, tipo: null }
  return { monto: redondear(excedente), tipo: "PROVEEDOR" }
}

/**
 * Cuenta que se reclasifica y cuenta de anticipo, por tipo.
 *
 * El anticipo de un cliente sale de Cuentas por Cobrar —que quedó con saldo
 * acreedor— y va a un pasivo. El anticipo a un proveedor sale de Cuentas por
 * Pagar —que quedó con saldo deudor— y va a un activo.
 */
export const RECLASIFICACION = {
  CLIENTE: {
    /** Se debita para restituir el saldo acreedor... */
    desde: "1.1.03",
    /** ...y se acredita el pasivo con el cliente. */
    hacia: "2.1.07",
  },
  PROVEEDOR: {
    /** Se acredita para restituir el saldo deudor... */
    desde: "2.1.01",
    /** ...y se debita el activo contra el proveedor. */
    hacia: "1.1.06",
  },
} as const

/**
 * Las dos líneas del asiento de reclasificación.
 *
 * Para un anticipo de CLIENTE: Debe 1.1.03 / Haber 2.1.07.
 * Para un anticipo a PROVEEDOR: Debe 1.1.06 / Haber 2.1.01.
 *
 * En los dos casos el Debe va a la cuenta cuyo saldo se restituye o se crea, y
 * el Haber a la que lo absorbe.
 */
export function lineasDeReclasificacion(
  tipo: TipoAnticipo,
  monto: number,
  cuentas: Record<string, string>,
  concepto: string
) {
  const mapa = RECLASIFICACION[tipo]
  const debeCodigo = tipo === "CLIENTE" ? mapa.desde : mapa.hacia
  const haberCodigo = tipo === "CLIENTE" ? mapa.hacia : mapa.desde

  const debeId = cuentas[debeCodigo]
  const haberId = cuentas[haberCodigo]
  if (!debeId || !haberId) return null

  return [
    {
      chart_account_id: debeId,
      debit_amount: monto,
      concept: concepto,
      legacy_type: "INCOME" as const,
    },
    {
      chart_account_id: haberId,
      credit_amount: monto,
      concept: concepto,
      legacy_type: "INCOME" as const,
    },
  ]
}
