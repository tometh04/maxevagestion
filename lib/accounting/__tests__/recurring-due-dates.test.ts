/**
 * @jest-environment node
 *
 * Ida y vuelta de la fecha de vencimiento de un gasto fijo (VIB-179).
 *
 * `calculatePreviousDueDate` existe para una sola cosa: cuando se borra el pago
 * de un gasto fijo, la recurrencia tiene que volver a deber el período borrado.
 * Si quedara adelantada, el gasto se saltearía un mes entero sin que nadie lo
 * note — que es peor que el problema que el borrado vino a resolver.
 */

import {
  calculateNextDueDate,
  calculatePreviousDueDate,
  type RecurringPaymentFrequency,
} from "../recurring-payments"

describe("calculatePreviousDueDate", () => {
  it("el caso que lo motivó: se borra el pago de septiembre y vuelve a vencer en septiembre", () => {
    // Facebook Rosario quedó con next_due_date = 01/10 después de pagarlo.
    // Al borrar ese pago tiene que volver a deber el 01/09.
    expect(calculatePreviousDueDate("2026-10-01", "MONTHLY")).toBe("2026-09-01")
  })

  it("cubre todas las frecuencias", () => {
    expect(calculatePreviousDueDate("2026-09-08", "WEEKLY")).toBe("2026-09-01")
    expect(calculatePreviousDueDate("2026-09-15", "BIWEEKLY")).toBe("2026-09-01")
    expect(calculatePreviousDueDate("2026-12-01", "QUARTERLY")).toBe("2026-09-01")
    expect(calculatePreviousDueDate("2027-09-01", "YEARLY")).toBe("2026-09-01")
  })

  it("deshace exactamente lo que hizo el pago, en fechas normales", () => {
    const frecuencias: RecurringPaymentFrequency[] = [
      "WEEKLY",
      "BIWEEKLY",
      "MONTHLY",
      "QUARTERLY",
      "YEARLY",
    ]

    for (const frecuencia of frecuencias) {
      const original = "2026-09-05"
      const siguiente = calculateNextDueDate(original, frecuencia)
      expect(calculatePreviousDueDate(siguiente, frecuencia)).toBe(original)
    }
  })

  it("en fin de mes no vuelve al día original, y está documentado", () => {
    // addMonths(31/01) → 28/02, y volver da 28/01, no 31/01. Es la misma
    // limitación del cálculo hacia adelante; se prefiere eso a inventar un día
    // que la recurrencia nunca tuvo. Se fija acá para que el día que alguien lo
    // "arregle" sepa qué está cambiando.
    const siguiente = calculateNextDueDate("2026-01-31", "MONTHLY")
    expect(siguiente).toBe("2026-02-28")
    expect(calculatePreviousDueDate(siguiente, "MONTHLY")).toBe("2026-01-28")
  })
})
