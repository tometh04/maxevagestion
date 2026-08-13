import { parseDateOnlyLocal } from "@/lib/utils/date-only"

/** Un tramo intermedio de la operación (operation_legs). */
export interface CheckinLeg {
  order_index?: number | null
  destination?: string | null
  departure_date?: string | null
  airline_name?: string | null
  reservation_code_air?: string | null
}

/**
 * Operación mínima que consume el armado de eventos de check-in.
 * Coincide con la proyección de /api/operations/upcoming-trips.
 */
export interface CheckinOperation {
  id: string
  file_code: string
  destination: string
  departure_date: string
  return_date: string | null
  adults: number
  children: number
  infants: number
  status: string
  sellers?: { name: string } | null
  /** Tramos cargados en operation_legs (vuelos internos del viaje). */
  legs?: CheckinLeg[] | null
}

/** Salida, regreso o tramo interno de una operación. */
export type CheckinEventKind = "departure" | "return" | "leg"

/** Un check-in individual: salida, regreso o tramo de una operación. */
export interface CheckinEvent {
  /** Clave estable y única para keys de React (evita colisiones entre tramos). */
  key: string
  operationId: string
  fileCode: string
  destination: string
  date: Date
  dateStr: string
  kind: CheckinEventKind
  /** Compatibilidad: true solo para el regreso principal. */
  isReturn: boolean
  totalPax: number
  sellerName?: string | null
  /** Solo tramos: aerolínea y código de reserva del vuelo interno. */
  airline?: string | null
  reservationCode?: string | null
  /** Solo tramos: etiqueta corta, ej. "Tramo 2". */
  segmentLabel?: string | null
}

/**
 * Construye la lista de eventos de check-in (salida + regreso + tramos internos)
 * con fecha mayor o igual a `todayDate`, ordenados por fecha ascendente.
 *
 * Los tramos (operation_legs) se agregan como eventos propios: un viaje
 * Maceió → Santiago carga el vuelo interno del 30/07 aunque la salida principal
 * sea el 23/07, para que Postventa vea todos los check-ins, no solo ida/regreso.
 *
 * Dedup por fecha dentro de cada operación: si un tramo sale el mismo día que la
 * salida o el regreso principal, no se duplica (ya está representado).
 *
 * Fuente de verdad única para el widget "Próximos Check-ins" del dashboard
 * y para la página "Agenda de salidas y regresos" (/operations/check-ins).
 */
export function buildCheckinEvents(
  operations: CheckinOperation[],
  todayDate: Date,
): CheckinEvent[] {
  const events: CheckinEvent[] = []

  for (const op of operations) {
    const totalPax = (op.adults ?? 0) + (op.children ?? 0) + (op.infants ?? 0)
    const sellerName = op.sellers?.name ?? null

    // Fechas ya representadas en esta operación (para no duplicar un tramo que
    // coincide con la salida o el regreso principal).
    const seenDates = new Set<string>()

    const departureDate = parseDateOnlyLocal(op.departure_date) ?? new Date(op.departure_date)
    if (op.departure_date) seenDates.add(op.departure_date)
    if (departureDate >= todayDate) {
      events.push({
        key: `${op.id}-departure`,
        operationId: op.id,
        fileCode: op.file_code,
        destination: op.destination,
        date: departureDate,
        dateStr: op.departure_date,
        kind: "departure",
        isReturn: false,
        totalPax,
        sellerName,
      })
    }

    if (op.return_date) {
      if (op.return_date) seenDates.add(op.return_date)
      const returnDate = parseDateOnlyLocal(op.return_date) ?? new Date(op.return_date)
      if (returnDate >= todayDate) {
        events.push({
          key: `${op.id}-return`,
          operationId: op.id,
          fileCode: op.file_code,
          destination: op.destination,
          date: returnDate,
          dateStr: op.return_date,
          kind: "return",
          isReturn: true,
          totalPax,
          sellerName,
        })
      }
    }

    // Tramos internos. Ordenados por order_index; se saltean los que no tienen
    // fecha, los ya vistos (misma fecha que ida/regreso u otro tramo) y los pasados.
    const legs = [...(op.legs ?? [])].sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    )
    legs.forEach((leg, index) => {
      const legDateStr = leg.departure_date
      if (!legDateStr || seenDates.has(legDateStr)) return
      seenDates.add(legDateStr)

      const legDate = parseDateOnlyLocal(legDateStr) ?? new Date(legDateStr)
      if (legDate < todayDate) return

      events.push({
        key: `${op.id}-leg-${leg.order_index ?? index}`,
        operationId: op.id,
        fileCode: op.file_code,
        destination: leg.destination || op.destination,
        date: legDate,
        dateStr: legDateStr,
        kind: "leg",
        isReturn: false,
        totalPax,
        sellerName,
        airline: leg.airline_name ?? null,
        reservationCode: leg.reservation_code_air ?? null,
        segmentLabel: `Tramo ${index + 1}`,
      })
    })
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())
  return events
}
