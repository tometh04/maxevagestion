/**
 * Cierre de ejercicio — refundición de resultados.
 *
 * QUÉ PROBLEMA RESUELVE
 * ---------------------
 * Las cuentas de resultado (la familia 4) acumulan desde que la agencia empezó
 * a llevar contabilidad y nadie las vuelve a cero. Sin cierre anual, el Estado
 * de Resultados de 2027 mostraría también todo 2026, y el Balance se desviaría
 * un poco más cada año.
 *
 * El cierre las cancela contra `3.1.04 Resultado del Ejercicio` y después
 * traslada ese saldo a `3.1.03 Resultados Acumulados`, que es donde vive la
 * historia del negocio.
 *
 * DOS ASIENTOS Y NO UNO
 * ---------------------
 * Es lo que hace un contador, y no es ceremonia: separa "cuánto dio el año" de
 * "dónde queda". Con un solo asiento el resultado del ejercicio nunca llega a
 * verse; queda absorbido en el mismo movimiento que lo calcula.
 *
 * UN PAR DE ASIENTOS POR MONEDA
 * -----------------------------
 * Las cuentas de resultado tienen saldo en pesos y en dólares. Convertir todo a
 * una sola moneda exigiría las cotizaciones mensuales del ejercicio, que hoy
 * están vacías; suponerlas sería inventar el resultado del año. Se refunde cada
 * moneda contra sí misma, que es lo único que se puede afirmar sin datos que no
 * tenemos.
 */
import { ACCOUNT_CODES } from "./account-codes"

const UMBRAL = 0.01
const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * El saldo acumulado de una cuenta de resultado en el ejercicio.
 *
 * Se reciben el Debe y el Haber crudos, sin signo aplicado, porque cada
 * consumidor del sistema usa un criterio distinto: el Mayor por Cuenta trata a
 * la familia 4 como deudora y el Estado de Resultados no. Acá se decide una vez
 * y explícitamente.
 */
export interface SaldoDeResultado {
  codigo: string
  nombre: string
  debe: number
  haber: number
}

export interface LineaDeCierre {
  codigo: string
  debe: number
  haber: number
  detalle: string
}

export type TipoDeAsientoDeCierre = "REFUNDICION" | "TRASLADO_RESULTADO"

export interface AsientoDeCierre {
  tipo: TipoDeAsientoDeCierre
  currency: string
  lineas: LineaDeCierre[]
  totalDebe: number
  totalHaber: number
}

export interface CierreDeEjercicio {
  currency: string
  /**
   * Resultado del ejercicio en esta moneda. Positivo = ganancia.
   *
   * Es el número que el contador mira antes de confirmar, así que se expone
   * aparte en vez de obligarlo a deducirlo de las líneas.
   */
  resultado: number
  asientos: AsientoDeCierre[]
}

/** El saldo neto de una cuenta: positivo si es deudor, negativo si acreedor. */
function neto(s: SaldoDeResultado): number {
  return redondear((Number(s.debe) || 0) - (Number(s.haber) || 0))
}

/**
 * Arma la refundición y el traslado de una moneda.
 *
 * Devuelve `null` si no hay nada que refundir: un ejercicio sin movimientos de
 * resultado no necesita cierre, y generar asientos vacíos solo ensuciaría el
 * libro.
 */
export function armarCierreDeEjercicio(
  saldos: SaldoDeResultado[],
  currency: string,
  ejercicio: number
): CierreDeEjercicio | null {
  const conSaldo = saldos.filter((s) => Math.abs(neto(s)) >= UMBRAL)
  if (conSaldo.length === 0) return null

  // ---- Asiento 1: cancelar cada cuenta de resultado ----
  const lineasRefundicion: LineaDeCierre[] = conSaldo.map((s) => {
    const n = neto(s)
    // Se cancela con el signo opuesto al que tiene: una cuenta con saldo
    // deudor se acredita y viceversa. Sirve para cualquier cuenta de la
    // familia 4 sin preguntar si es ingreso, costo o gasto.
    return {
      codigo: s.codigo,
      debe: n < 0 ? Math.abs(n) : 0,
      haber: n > 0 ? n : 0,
      detalle: `Cierre de ejercicio ${ejercicio} — ${s.nombre}`,
    }
  })

  const debeParcial = redondear(lineasRefundicion.reduce((t, l) => t + l.debe, 0))
  const haberParcial = redondear(lineasRefundicion.reduce((t, l) => t + l.haber, 0))

  // Debe − Haber de las cancelaciones ES el resultado del ejercicio: las
  // cuentas de ingreso se cancelan por el Debe y las de costo y gasto por el
  // Haber, así que la diferencia es lo que ganó el negocio.
  const resultado = redondear(debeParcial - haberParcial)

  if (Math.abs(resultado) >= UMBRAL) {
    lineasRefundicion.push({
      codigo: ACCOUNT_CODES.RESULTADO_EJERCICIO,
      // Ganancia: el resultado se acredita. Pérdida: se debita.
      debe: resultado < 0 ? Math.abs(resultado) : 0,
      haber: resultado > 0 ? resultado : 0,
      detalle: `Resultado del ejercicio ${ejercicio}`,
    })
  }

  const asientos: AsientoDeCierre[] = [
    {
      tipo: "REFUNDICION",
      currency,
      lineas: lineasRefundicion,
      totalDebe: redondear(lineasRefundicion.reduce((t, l) => t + l.debe, 0)),
      totalHaber: redondear(lineasRefundicion.reduce((t, l) => t + l.haber, 0)),
    },
  ]

  // ---- Asiento 2: llevar el resultado al patrimonio ----
  // Solo si hubo resultado. Un ejercicio que dio exactamente cero no necesita
  // trasladar nada.
  if (Math.abs(resultado) >= UMBRAL) {
    const lineasTraslado: LineaDeCierre[] = [
      {
        codigo: ACCOUNT_CODES.RESULTADO_EJERCICIO,
        // Se cancela con el signo opuesto al que quedó en la refundición.
        debe: resultado > 0 ? resultado : 0,
        haber: resultado < 0 ? Math.abs(resultado) : 0,
        detalle: `Traslado del resultado del ejercicio ${ejercicio}`,
      },
      {
        codigo: ACCOUNT_CODES.RESULTADOS_ACUMULADOS,
        debe: resultado < 0 ? Math.abs(resultado) : 0,
        haber: resultado > 0 ? resultado : 0,
        detalle: `Resultado del ejercicio ${ejercicio} acumulado`,
      },
    ]

    asientos.push({
      tipo: "TRASLADO_RESULTADO",
      currency,
      lineas: lineasTraslado,
      totalDebe: redondear(lineasTraslado.reduce((t, l) => t + l.debe, 0)),
      totalHaber: redondear(lineasTraslado.reduce((t, l) => t + l.haber, 0)),
    })
  }

  return { currency, resultado, asientos }
}
