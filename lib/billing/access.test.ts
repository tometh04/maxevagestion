/**
 * @jest-environment node
 */
import { isAccessAllowed } from "./access"

const NOW = Date.now()
const inDays = (n: number) => new Date(NOW + n * 24 * 3600 * 1000).toISOString()

describe("isAccessAllowed", () => {
  it("PENDING_PAYMENT y SUSPENDED → sin acceso", () => {
    expect(isAccessAllowed({ subscription_status: "PENDING_PAYMENT", current_period_ends_at: null, trial_ends_at: null })).toBe(false)
    expect(isAccessAllowed({ subscription_status: "SUSPENDED", current_period_ends_at: null, trial_ends_at: null })).toBe(false)
  })

  it("ACTIVE → siempre acceso", () => {
    expect(isAccessAllowed({ subscription_status: "ACTIVE", current_period_ends_at: null, trial_ends_at: null })).toBe(true)
  })

  it("PAST_DUE con gracia vigente (period + 5d en el futuro) → acceso", () => {
    // period venció ayer → gracia hasta +4d → acceso
    expect(isAccessAllowed({ subscription_status: "PAST_DUE", current_period_ends_at: inDays(-1), trial_ends_at: null })).toBe(true)
  })

  it("PAST_DUE gracia de 5 días: period hace 4 días → todavía acceso", () => {
    // Antes (gracia 3) esto era false; con gracia 5 sigue con acceso.
    expect(isAccessAllowed({ subscription_status: "PAST_DUE", current_period_ends_at: inDays(-4), trial_ends_at: null })).toBe(true)
  })

  it("PAST_DUE con gracia vencida (period + 5d ya pasó) → sin acceso", () => {
    expect(isAccessAllowed({ subscription_status: "PAST_DUE", current_period_ends_at: inDays(-7), trial_ends_at: null })).toBe(false)
  })

  it("PAST_DUE sin current_period_ends_at → sin acceso (defensivo)", () => {
    expect(isAccessAllowed({ subscription_status: "PAST_DUE", current_period_ends_at: null, trial_ends_at: null })).toBe(false)
  })

  it("CANCELLED con período futuro → acceso hasta esa fecha", () => {
    expect(isAccessAllowed({ subscription_status: "CANCELLED", current_period_ends_at: inDays(5), trial_ends_at: null })).toBe(true)
    expect(isAccessAllowed({ subscription_status: "CANCELLED", current_period_ends_at: inDays(-1), trial_ends_at: null })).toBe(false)
  })

  it("TRIALING respeta trial_ends_at", () => {
    expect(isAccessAllowed({ subscription_status: "TRIALING", current_period_ends_at: null, trial_ends_at: inDays(2) })).toBe(true)
    expect(isAccessAllowed({ subscription_status: "TRIALING", current_period_ends_at: null, trial_ends_at: inDays(-1) })).toBe(false)
  })
})
