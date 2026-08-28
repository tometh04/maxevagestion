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

/**
 * Cuántas veces la venta puede superarse antes de que deje de ser un anticipo.
 *
 * Un cliente que paga un 5% de más está anticipando. Uno que paga 58 veces la
 * venta no: ese número salió de una venta mal cargada. El caso es real y está
 * medido: en las operaciones importadas de Lozada Rosario hay una con venta
 * USD 100 y cobros por USD 5.850, y el operador cobró 5.208 — o sea que la
 * venta verdadera rondaba los 5.850 y el 100 es el dato equivocado.
 *
 * Asentar eso crearía un pasivo de USD 5.750 que la agencia no le debe a nadie.
 * El umbral es deliberadamente holgado: prefiere dejar pasar un dato raro antes
 * que descartar un anticipo legítimo, porque lo que se descarta se informa y
 * alguien lo mira, mientras que lo que se asienta mal se vuelve un pasivo que
 * nadie cuestiona.
 */
export const FACTOR_IMPLAUSIBLE = 3

export interface Anomalia {
  operationId: string
  numero: string
  motivo: string
  venta: number
  cobrado: number
  currency: string
}

/**
 * Si el excedente de una operación es creíble como anticipo.
 *
 * Una venta en cero o casi cero no permite juzgar proporción alguna, y es
 * justamente la forma que toma el dato faltante, así que se trata aparte.
 */
export function esAnticipoCreible(venta: number, cobrado: number): boolean {
  const v = Number(venta) || 0
  const c = Number(cobrado) || 0
  if (v < 1) return false
  return c <= v * FACTOR_IMPLAUSIBLE
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
    // El excedente implausible NO se asienta: se informa. Ver esAnticipoCreible.
    if (a.tipo && esAnticipoCreible(op.ventaDevengada, op.cobrado)) {
      agregar("ANTICIPO_CLIENTE", a.monto, op.currency, "Anticipo de cliente")
    }
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
  /**
   * Excedentes que NO se asentaron por implausibles. No son un error del
   * cierre: son operaciones con un dato mal cargado que alguien tiene que
   * mirar. Se informan en vez de descartarse en silencio, que es la diferencia
   * entre un sistema contable y uno que esconde lo que no entiende.
   */
  anomalias: Anomalia[]
  /** Cuántos ajustes de cada tipo, para mostrar el resultado sin recontar. */
  resumen: Record<TipoDeAjuste, { cantidad: number; porMoneda: Record<string, number> }>
}

/** El plan completo del período. */
export function planificarCierre(
  operaciones: OperacionAlCierre[],
  config: ConfiguracionDeCierre
): PlanDeCierre {
  const ajustes = operaciones.flatMap((op) => planificarOperacion(op, config))

  const anomalias: Anomalia[] = []
  if (config.anticipos_clientes) {
    for (const op of operaciones) {
      const excedente = (Number(op.cobrado) || 0) - (Number(op.ventaDevengada) || 0)
      if (excedente >= 0.01 && !esAnticipoCreible(op.ventaDevengada, op.cobrado)) {
        anomalias.push({
          operationId: op.id,
          numero: op.numero,
          motivo:
            op.ventaDevengada < 1
              ? "La operación no tiene importe de venta cargado, pero registra cobros."
              : `Los cobros superan la venta más de ${FACTOR_IMPLAUSIBLE} veces.`,
          venta: Number(op.ventaDevengada) || 0,
          cobrado: Number(op.cobrado) || 0,
          currency: op.currency,
        })
      }
    }
  }

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

  return { ajustes, anomalias, resumen }
}
