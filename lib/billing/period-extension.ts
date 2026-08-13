/**
 * Cálculo puro del nuevo período de suscripción al registrar un pago manual.
 *
 * Contexto: las orgs que pagan por fuera de Mercado Pago (transferencia,
 * factura A) no tienen preapproval, así que ni el webhook ni
 * `billing-reconcile` les mueven `current_period_ends_at`. El vencimiento lo
 * extiende un platform admin a mano cuando confirma el pago del mes.
 *
 * Reglas:
 *  - El nuevo período arranca donde terminó el anterior, NO "hoy". Si la org
 *    venció el 1/08 y el admin registra el pago el 6/08, el mes cubierto es
 *    1/08 → 1/09 (facturación continua, sin regalar los días de atraso).
 *  - Si nunca hubo período (org nueva / migrada), se ancla en `now`.
 *  - La suma de meses clampea a fin de mes: 31/01 + 1 mes = 28/02, no 03/03.
 *  - Se preserva la hora del vencimiento original para que el corte no se
 *    adelante unas horas en cada renovación.
 */

export interface PeriodExtensionInput {
  /** `organizations.current_period_ends_at` (ISO) o null si no hay período. */
  currentPeriodEndsAt: string | null
  /** Meses a cubrir. Entero >= 1. */
  months: number
  /** Inyectable para tests. */
  now?: Date
}

export interface PeriodExtension {
  /** De dónde se ancló el período nuevo. */
  basedOn: "current_period" | "now"
  /** `manual_payments.covers_from` — columna DATE, "YYYY-MM-DD". */
  coversFrom: string
  /** `manual_payments.covers_to` — columna DATE, "YYYY-MM-DD". */
  coversTo: string
  /** `organizations.current_period_ends_at` nuevo (ISO, hora preservada). */
  periodEndsAt: string
  /** true si aún después de extender el vencimiento queda en el pasado. */
  stillOverdue: boolean
}

export const MAX_EXTENSION_MONTHS = 24

/**
 * Suma meses en UTC clampeando al último día del mes destino.
 * Preserva hora/minuto/segundo del original.
 */
export function addMonthsClampedUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  // Día 1 del mes destino para no disparar el overflow nativo de setUTCMonth.
  const target = new Date(
    Date.UTC(
      year,
      month + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  )
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  return target
}

/** Parte fecha (UTC) de una Date, como "YYYY-MM-DD" para columnas DATE. */
export function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Calcula el período que cubre un pago manual y el vencimiento resultante.
 * Lanza RangeError si `months` no es un entero entre 1 y MAX_EXTENSION_MONTHS.
 */
export function computePeriodExtension(input: PeriodExtensionInput): PeriodExtension {
  const { currentPeriodEndsAt, months } = input
  const now = input.now ?? new Date()

  if (!Number.isInteger(months) || months < 1 || months > MAX_EXTENSION_MONTHS) {
    throw new RangeError(`months debe ser un entero entre 1 y ${MAX_EXTENSION_MONTHS}`)
  }

  const parsed = currentPeriodEndsAt ? new Date(currentPeriodEndsAt) : null
  const hasCurrent = parsed != null && !Number.isNaN(parsed.getTime())
  const base = hasCurrent ? (parsed as Date) : now

  const end = addMonthsClampedUtc(base, months)

  return {
    basedOn: hasCurrent ? "current_period" : "now",
    coversFrom: toDateOnlyUtc(base),
    coversTo: toDateOnlyUtc(end),
    periodEndsAt: end.toISOString(),
    stillOverdue: end.getTime() <= now.getTime(),
  }
}

/**
 * Días de atraso del vencimiento vigente (0 si está al día o no hay período).
 * Se usa solo para mostrar contexto en el admin.
 */
export function daysOverdue(
  currentPeriodEndsAt: string | null,
  now: Date = new Date()
): number {
  if (!currentPeriodEndsAt) return 0
  const end = new Date(currentPeriodEndsAt)
  if (Number.isNaN(end.getTime())) return 0
  const diffMs = now.getTime() - end.getTime()
  if (diffMs <= 0) return 0
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}
