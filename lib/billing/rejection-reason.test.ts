import { parseRejectionReason, formatRejectionReason } from "./rejection-reason"

describe("parseRejectionReason", () => {
  it("devuelve null solo cuando MP no informó status_detail", () => {
    expect(parseRejectionReason(null)).toBeNull()
    expect(parseRejectionReason(undefined)).toBeNull()
    expect(parseRejectionReason("")).toBeNull()
  })

  it("marca saldo insuficiente como reintentable (el cliente carga plata y entra)", () => {
    const r = parseRejectionReason("cc_rejected_insufficient_amount")!
    expect(r.label).toBe("Fondos insuficientes")
    expect(r.retryable).toBe(true)
  })

  it("marca los rechazos de datos de tarjeta como NO reintentables", () => {
    // Reintentar el mismo medio no sirve: hay que rehacer el medio de pago.
    for (const code of [
      "cc_rejected_bad_filled_security_code",
      "cc_rejected_card_disabled",
      "cc_rejected_high_risk",
    ]) {
      expect(parseRejectionReason(code)!.retryable).toBe(false)
    }
  })

  it("no se traga un código desconocido: lo devuelve crudo", () => {
    const r = parseRejectionReason("cc_rejected_motivo_nuevo_de_mp")!
    expect(r.code).toBe("cc_rejected_motivo_nuevo_de_mp")
    expect(r.label).toContain("cc_rejected_motivo_nuevo_de_mp")
  })

  it("formatea una línea legible para Slack/admin", () => {
    expect(formatRejectionReason("cc_rejected_insufficient_amount")).toBe(
      "Fondos insuficientes (cc_rejected_insufficient_amount)"
    )
    expect(formatRejectionReason(null)).toBe("motivo no informado por MP")
  })
})
