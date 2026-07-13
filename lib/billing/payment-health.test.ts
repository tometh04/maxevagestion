/**
 * @jest-environment node
 */
import { isSilentChargeFailure } from "./payment-health"

const NOW = new Date("2026-07-13T00:00:00Z").getTime()

describe("isSilentChargeFailure", () => {
  it("detecta: ACTIVE + authorized + next_payment vencido + sin cobro nunca", () => {
    expect(
      isSilentChargeFailure({
        effectiveStatus: "ACTIVE",
        mpStatus: "authorized",
        nextPaymentDate: "2026-07-01T00:00:00Z", // venció hace 12 días
        lastChargedDate: null,
        now: NOW,
      })
    ).toBe(true)
  })

  it("detecta: último cobro es de un ciclo anterior al vencido", () => {
    expect(
      isSilentChargeFailure({
        effectiveStatus: "ACTIVE",
        mpStatus: "authorized",
        nextPaymentDate: "2026-07-01T00:00:00Z",
        lastChargedDate: "2026-05-15T00:00:00Z", // anterior al ciclo de julio
        now: NOW,
      })
    ).toBe(true)
  })

  it("NO alerta si el cobro del ciclo vigente sí se hizo", () => {
    expect(
      isSilentChargeFailure({
        effectiveStatus: "ACTIVE",
        mpStatus: "authorized",
        nextPaymentDate: "2026-07-01T00:00:00Z",
        lastChargedDate: "2026-06-20T00:00:00Z", // dentro del ciclo (~28d antes)
        now: NOW,
      })
    ).toBe(false)
  })

  it("NO alerta si el próximo cobro todavía no venció (dentro del grace)", () => {
    expect(
      isSilentChargeFailure({
        effectiveStatus: "ACTIVE",
        mpStatus: "authorized",
        nextPaymentDate: "2026-07-12T00:00:00Z", // ayer, dentro del grace de 3d
        lastChargedDate: null,
        now: NOW,
      })
    ).toBe(false)
  })

  it("NO aplica si la org no es ACTIVE", () => {
    expect(
      isSilentChargeFailure({
        effectiveStatus: "TRIALING",
        mpStatus: "authorized",
        nextPaymentDate: "2026-07-01T00:00:00Z",
        lastChargedDate: null,
        now: NOW,
      })
    ).toBe(false)
  })

  it("NO aplica si el preapproval no está authorized (paused → ya lo maneja la state machine)", () => {
    expect(
      isSilentChargeFailure({
        effectiveStatus: "ACTIVE",
        mpStatus: "paused",
        nextPaymentDate: "2026-07-01T00:00:00Z",
        lastChargedDate: null,
        now: NOW,
      })
    ).toBe(false)
  })
})
