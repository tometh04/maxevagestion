/**
 * Fecha de emisión del comprobante (CbteFch), en un solo lugar.
 *
 * Hasta ahora la fecha de emisión se fijaba sola en "hoy" y no había forma de
 * facturar con fecha anterior, aunque AFIP lo permite: pedido concreto de una
 * agencia que cerró el mes y necesitaba emitir con la fecha del último día.
 *
 * La ventana la define AFIP según el concepto del comprobante (manual WSFEv1):
 * 5 días para Productos y 10 para Servicios, tanto hacia atrás como hacia
 * adelante. Si se manda algo fuera de rango AFIP rechaza el voucher con el
 * error 10024, así que conviene frenarlo antes y explicar por qué.
 *
 * Lo que esta ventana NO cubre (AFIP lo valida igual y no lo podemos saber sin
 * consultarle): la fecha no puede ser anterior a la del último comprobante
 * autorizado del mismo punto de venta y tipo. Por eso el mensaje de la UI lo
 * aclara en lugar de prometer que cualquier fecha del rango va a entrar.
 *
 * Sin imports server-only a propósito: la API (gate real) y el formulario
 * (que dibuja el min/max del input) tienen que usar la misma regla.
 */

/** Concepto AFIP: 1=Productos, 2=Servicios, 3=Productos y Servicios. */
export const AFIP_ISSUE_DATE_WINDOW_DAYS = {
  /** Concepto 1. */
  PRODUCTOS: 5,
  /** Conceptos 2 y 3. */
  SERVICIOS: 10,
} as const

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY.test(value)
}

/** Cuántos días para atrás y para adelante acepta AFIP para ese concepto. */
export function issueDateWindowDays(concepto: number | null | undefined): number {
  return concepto === 2 || concepto === 3
    ? AFIP_ISSUE_DATE_WINDOW_DAYS.SERVICIOS
    : AFIP_ISSUE_DATE_WINDOW_DAYS.PRODUCTOS
}

/**
 * Suma (o resta) días a una fecha `YYYY-MM-DD` sin pasar por la zona horaria
 * local: se arma en UTC a propósito, igual que el resto de las columnas DATE
 * (ver `lib/utils/date-only.ts`).
 */
export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const m = DATE_ONLY.exec(dateOnly)
  if (!m) return dateOnly
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface IssueDateBounds {
  /** Fecha mínima aceptada, `YYYY-MM-DD`. */
  min: string
  /** Fecha máxima aceptada, `YYYY-MM-DD`. */
  max: string
  /** Días de la ventana, para armar el texto de ayuda. */
  days: number
}

/** Límites del calendario para el concepto y el día de hoy dados. */
export function issueDateBounds(
  concepto: number | null | undefined,
  today: string
): IssueDateBounds {
  const days = issueDateWindowDays(concepto)
  return {
    min: addDaysToDateOnly(today, -days),
    max: addDaysToDateOnly(today, days),
    days,
  }
}

export type IssueDateCheck = { ok: true } | { ok: false; error: string }

/**
 * Valida la fecha de emisión elegida por el usuario. `today` se pasa desde
 * afuera (`todayInArgentina()`) para que la función sea pura y testeable.
 */
export function validateIssueDate(
  fechaEmision: string,
  concepto: number | null | undefined,
  today: string
): IssueDateCheck {
  if (!isDateOnly(fechaEmision)) {
    return { ok: false, error: "La fecha de emisión debe tener formato YYYY-MM-DD" }
  }

  const { min, max, days } = issueDateBounds(concepto, today)

  if (fechaEmision < min || fechaEmision > max) {
    const concept = days === AFIP_ISSUE_DATE_WINDOW_DAYS.SERVICIOS ? "Servicios" : "Productos"
    return {
      ok: false,
      error:
        `AFIP no acepta esa fecha de emisión: para comprobantes de ${concept} el rango es de ` +
        `${days} días para atrás y ${days} para adelante (del ${min} al ${max}).`,
    }
  }

  return { ok: true }
}
