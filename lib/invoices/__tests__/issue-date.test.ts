import {
  addDaysToDateOnly,
  issueDateBounds,
  issueDateWindowDays,
  validateIssueDate,
} from "@/lib/invoices/issue-date"

describe("issueDateWindowDays", () => {
  it("da 10 días para Servicios (concepto 2) y Productos y Servicios (3)", () => {
    expect(issueDateWindowDays(2)).toBe(10)
    expect(issueDateWindowDays(3)).toBe(10)
  })

  it("da 5 días para Productos (concepto 1)", () => {
    expect(issueDateWindowDays(1)).toBe(5)
  })

  it("cae en la ventana chica si el concepto no vino", () => {
    expect(issueDateWindowDays(null)).toBe(5)
    expect(issueDateWindowDays(undefined)).toBe(5)
  })
})

describe("addDaysToDateOnly", () => {
  it("cruza el fin de mes sin correrse por zona horaria", () => {
    expect(addDaysToDateOnly("2026-09-07", -10)).toBe("2026-08-28")
    expect(addDaysToDateOnly("2026-08-31", 1)).toBe("2026-09-01")
  })

  it("cruza el fin de año", () => {
    expect(addDaysToDateOnly("2026-01-03", -5)).toBe("2025-12-29")
  })

  it("resuelve el año bisiesto", () => {
    expect(addDaysToDateOnly("2028-03-01", -1)).toBe("2028-02-29")
  })
})

describe("issueDateBounds", () => {
  it("abre la ventana simétrica alrededor de hoy", () => {
    expect(issueDateBounds(2, "2026-09-08")).toEqual({
      min: "2026-08-29",
      max: "2026-09-18",
      days: 10,
    })
  })
})

describe("validateIssueDate", () => {
  const today = "2026-09-08"

  it("acepta el caso que motivó el cambio: facturar el 31/08 desde el 08/09", () => {
    expect(validateIssueDate("2026-08-31", 2, today)).toEqual({ ok: true })
  })

  it("acepta hoy y los dos bordes de la ventana", () => {
    expect(validateIssueDate(today, 2, today).ok).toBe(true)
    expect(validateIssueDate("2026-08-29", 2, today).ok).toBe(true)
    expect(validateIssueDate("2026-09-18", 2, today).ok).toBe(true)
  })

  it("rechaza un día más allá del borde, para atrás y para adelante", () => {
    expect(validateIssueDate("2026-08-28", 2, today).ok).toBe(false)
    expect(validateIssueDate("2026-09-19", 2, today).ok).toBe(false)
  })

  it("aplica la ventana chica a Productos: el 31/08 ya no entra", () => {
    expect(validateIssueDate("2026-08-31", 1, today).ok).toBe(false)
    expect(validateIssueDate("2026-09-03", 1, today).ok).toBe(true)
  })

  it("dice el rango concreto en el error, no solo que está mal", () => {
    const result = validateIssueDate("2026-07-01", 2, today)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("2026-08-29")
      expect(result.error).toContain("2026-09-18")
    }
  })

  it("rechaza cualquier cosa que no sea una fecha YYYY-MM-DD", () => {
    expect(validateIssueDate("31/08/2026", 2, today).ok).toBe(false)
    expect(validateIssueDate("", 2, today).ok).toBe(false)
  })
})
