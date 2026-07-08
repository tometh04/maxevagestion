import { parseDateOnlyLocal } from "@/lib/utils/date-only"

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
}

/** Un check-in individual: salida o regreso de una operación. */
export interface CheckinEvent {
  operationId: string
  fileCode: string
  destination: string
  date: Date
  dateStr: string
  isReturn: boolean
  totalPax: number
  sellerName?: string | null
}

/**
 * Construye la lista de eventos de check-in (salida + regreso) con fecha
 * mayor o igual a `todayDate`, ordenados por fecha ascendente.
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

    const departureDate = parseDateOnlyLocal(op.departure_date) ?? new Date(op.departure_date)
    if (departureDate >= todayDate) {
      events.push({
        operationId: op.id,
        fileCode: op.file_code,
        destination: op.destination,
        date: departureDate,
        dateStr: op.departure_date,
        isReturn: false,
        totalPax,
        sellerName,
      })
    }

    if (op.return_date) {
      const returnDate = parseDateOnlyLocal(op.return_date) ?? new Date(op.return_date)
      if (returnDate >= todayDate) {
        events.push({
          operationId: op.id,
          fileCode: op.file_code,
          destination: op.destination,
          date: returnDate,
          dateStr: op.return_date,
          isReturn: true,
          totalPax,
          sellerName,
        })
      }
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())
  return events
}
