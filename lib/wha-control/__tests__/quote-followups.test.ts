import {
  computeScheduledFor,
  decideFollowupAction,
  isWithinSendWindow,
  nextWindowSlot,
  renderFollowupText,
} from "../quote-followups"

// Helper: construye un Date desde hora argentina (UTC-3).
// arg(2026, 9, 3, 15) => 2026-09-03T15:00 ARG = 2026-09-03T18:00Z
function arg(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute))
}

const WINDOW = { from: 9, to: 21 }

describe("isWithinSendWindow", () => {
  it("dentro de la ventana", () => {
    expect(isWithinSendWindow(arg(2026, 9, 3, 12), WINDOW)).toBe(true)
  })
  it("borde inferior inclusive", () => {
    expect(isWithinSendWindow(arg(2026, 9, 3, 9), WINDOW)).toBe(true)
  })
  it("borde superior exclusive", () => {
    expect(isWithinSendWindow(arg(2026, 9, 3, 21), WINDOW)).toBe(false)
  })
  it("último minuto válido", () => {
    expect(isWithinSendWindow(arg(2026, 9, 3, 20, 59), WINDOW)).toBe(true)
  })
  it("madrugada fuera de ventana", () => {
    expect(isWithinSendWindow(arg(2026, 9, 3, 3), WINDOW)).toBe(false)
  })
})

describe("computeScheduledFor", () => {
  it("marca 10:00 + 24h cae 10:00 del día siguiente (dentro de ventana)", () => {
    const result = computeScheduledFor(arg(2026, 9, 3, 10), 24, WINDOW)
    expect(result).toEqual(arg(2026, 9, 4, 10))
  })

  it("cae después del cierre => corre al from del día siguiente", () => {
    // marca 20:00 + 2h = 22:00 (fuera) => 9:00 del día siguiente
    const result = computeScheduledFor(arg(2026, 9, 3, 20), 2, WINDOW)
    expect(result).toEqual(arg(2026, 9, 4, 9))
  })

  it("cae de madrugada antes del from => corre al from del mismo día", () => {
    // marca 23:00 + 4h = 3:00 (fuera, antes del from) => 9:00 mismo día
    const result = computeScheduledFor(arg(2026, 9, 3, 23), 4, WINDOW)
    expect(result).toEqual(arg(2026, 9, 4, 9))
  })

  it("espera multi-día conserva la hora si está en ventana", () => {
    const result = computeScheduledFor(arg(2026, 9, 3, 15), 72, WINDOW)
    expect(result).toEqual(arg(2026, 9, 6, 15))
  })

  it("cae exactamente a la hora de cierre => día siguiente", () => {
    // marca 9:00 + 12h = 21:00 (exclusive) => 9:00 día siguiente
    const result = computeScheduledFor(arg(2026, 9, 3, 9), 12, WINDOW)
    expect(result).toEqual(arg(2026, 9, 4, 9))
  })
})

describe("nextWindowSlot", () => {
  it("dentro de ventana devuelve el mismo instante", () => {
    const d = arg(2026, 9, 3, 14, 30)
    expect(nextWindowSlot(d, WINDOW)).toEqual(d)
  })
  it("antes del from => from de hoy", () => {
    expect(nextWindowSlot(arg(2026, 9, 3, 6), WINDOW)).toEqual(arg(2026, 9, 3, 9))
  })
  it("después del to => from de mañana", () => {
    expect(nextWindowSlot(arg(2026, 9, 3, 22), WINDOW)).toEqual(
      arg(2026, 9, 4, 9)
    )
  })
})

describe("decideFollowupAction", () => {
  const markedAt = arg(2026, 9, 3, 10)

  it("sin mensajes posteriores => send", () => {
    expect(decideFollowupAction({ markedAt, messages: [] })).toEqual({
      action: "send",
    })
  })

  it("inbound posterior a la marca => client_replied", () => {
    const result = decideFollowupAction({
      markedAt,
      messages: [{ direction: "inbound", sent_at: arg(2026, 9, 3, 12) }],
    })
    expect(result).toEqual({ action: "cancel", reason: "client_replied" })
  })

  it("inbound ANTERIOR a la marca se ignora", () => {
    const result = decideFollowupAction({
      markedAt,
      messages: [{ direction: "inbound", sent_at: arg(2026, 9, 3, 9) }],
    })
    expect(result).toEqual({ action: "send" })
  })

  it("outbound dentro del buffer (echo de la cotización) => send", () => {
    const result = decideFollowupAction({
      markedAt,
      messages: [{ direction: "outbound", sent_at: arg(2026, 9, 3, 10, 2) }],
    })
    expect(result).toEqual({ action: "send" })
  })

  it("outbound pasado el buffer => seller_followed_up", () => {
    const result = decideFollowupAction({
      markedAt,
      messages: [{ direction: "outbound", sent_at: arg(2026, 9, 3, 10, 20) }],
    })
    expect(result).toEqual({ action: "cancel", reason: "seller_followed_up" })
  })

  it("inbound gana sobre outbound del vendedor", () => {
    const result = decideFollowupAction({
      markedAt,
      messages: [
        { direction: "outbound", sent_at: arg(2026, 9, 3, 11) },
        { direction: "inbound", sent_at: arg(2026, 9, 3, 12) },
      ],
    })
    expect(result).toEqual({ action: "cancel", reason: "client_replied" })
  })

  it("mensajes system no afectan", () => {
    const result = decideFollowupAction({
      markedAt,
      messages: [{ direction: "system", sent_at: arg(2026, 9, 3, 12) }],
    })
    expect(result).toEqual({ action: "send" })
  })
})

describe("renderFollowupText", () => {
  it("reemplaza {nombre}", () => {
    expect(renderFollowupText("Hola {nombre}! ¿Cómo estás?", "Marta")).toBe(
      "Hola Marta! ¿Cómo estás?"
    )
  })
  it("sin nombre limpia el token y los espacios", () => {
    expect(renderFollowupText("Hola {nombre}! ¿Cómo estás?", null)).toBe(
      "Hola ! ¿Cómo estás?"
    )
    expect(renderFollowupText("Hola {nombre} , todo bien?", "")).toBe(
      "Hola , todo bien?"
    )
  })
  it("template sin token queda igual", () => {
    expect(renderFollowupText("Hola!", "Marta")).toBe("Hola!")
  })
})
