import { transitionFromMP, type MPPreapproval, type MPPaymentEvent } from "./state-machine"

function mp(overrides: Partial<MPPreapproval>): MPPreapproval {
  return {
    id: "pa_test",
    status: "authorized",
    external_reference: "org_1",
    last_modified: "2026-04-21T10:00:00Z",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 119000,
      currency_id: "ARS",
    },
    next_payment_date: "2026-05-21T10:00:00Z",
    ...overrides,
  }
}

describe("transitionFromMP", () => {
  it("pending → PENDING_PAYMENT", () => {
    const out = transitionFromMP(mp({ status: "pending" }))
    expect(out.subscription_status).toBe("PENDING_PAYMENT")
    expect(out.current_period_ends_at).toBeNull()
  })

  it("authorized with free_trial → TRIALING", () => {
    const futureDate = new Date(Date.now() + 7 * 86400_000).toISOString()
    const out = transitionFromMP(mp({
      status: "authorized",
      auto_recurring: {
        frequency: 1, frequency_type: "months",
        transaction_amount: 119000, currency_id: "ARS",
        free_trial: { frequency: 7, frequency_type: "days" },
      },
      next_payment_date: futureDate,
    }))
    expect(out.subscription_status).toBe("TRIALING")
    expect(out.current_period_ends_at).toBe(futureDate)
  })

  it("authorized (no free_trial) + approved payment → ACTIVE", () => {
    const out = transitionFromMP(
      mp({ status: "authorized" }),
      { type: "subscription_authorized_payment", status: "approved" }
    )
    expect(out.subscription_status).toBe("ACTIVE")
    expect(out.current_period_ends_at).toBe("2026-05-21T10:00:00Z")
  })

  it("authorized + rejected payment → PAST_DUE (preserves period)", () => {
    const out = transitionFromMP(
      mp({ status: "authorized" }),
      { type: "subscription_authorized_payment", status: "rejected" },
      { preserved_current_period_ends_at: "2026-05-21T10:00:00Z" }
    )
    expect(out.subscription_status).toBe("PAST_DUE")
    expect(out.current_period_ends_at).toBe("2026-05-21T10:00:00Z")
  })

  it("paused → PAST_DUE", () => {
    const out = transitionFromMP(mp({ status: "paused" }))
    expect(out.subscription_status).toBe("PAST_DUE")
  })

  it("cancelled freezes current_period_ends_at", () => {
    const out = transitionFromMP(
      mp({ status: "cancelled" }),
      undefined,
      { preserved_current_period_ends_at: "2026-05-21T10:00:00Z" }
    )
    expect(out.subscription_status).toBe("CANCELLED")
    expect(out.current_period_ends_at).toBe("2026-05-21T10:00:00Z")
  })

  it("finished → CANCELLED", () => {
    const out = transitionFromMP(mp({ status: "finished" }))
    expect(out.subscription_status).toBe("CANCELLED")
    expect(out.event_type).toBe("SUBSCRIPTION_FINISHED")
  })

  it("authorized with expired free_trial (no payment event) → PAST_DUE", () => {
    const pastDate = new Date(Date.now() - 86400_000).toISOString()
    const out = transitionFromMP(mp({
      status: "authorized",
      auto_recurring: {
        frequency: 1, frequency_type: "months",
        transaction_amount: 119000, currency_id: "ARS",
        free_trial: { frequency: 7, frequency_type: "days" },
      },
      next_payment_date: pastDate,
    }))
    expect(out.subscription_status).toBe("PAST_DUE")
    expect(out.event_type).toBe("TRIAL_EXPIRED")
  })

  it("authorized with expired free_trial + payment approved → ACTIVE", () => {
    const pastDate = new Date(Date.now() - 86400_000).toISOString()
    const nextDate = new Date(Date.now() + 30 * 86400_000).toISOString()
    const out = transitionFromMP(
      mp({
        status: "authorized",
        auto_recurring: {
          frequency: 1, frequency_type: "months",
          transaction_amount: 119000, currency_id: "ARS",
          free_trial: { frequency: 7, frequency_type: "days" },
        },
        next_payment_date: nextDate,
      }),
      { type: "subscription_authorized_payment", status: "approved" }
    )
    expect(out.subscription_status).toBe("ACTIVE")
    expect(out.current_period_ends_at).toBe(nextDate)
  })

  it("authorized without free_trial (regular sub) → ACTIVE", () => {
    const out = transitionFromMP(mp({ status: "authorized" }))
    expect(out.subscription_status).toBe("ACTIVE")
    expect(out.event_type).toBe("SUBSCRIPTION_AUTHORIZED")
  })

  // --- Fix "mes gratis": cobro no ejecutado con MP todavía "authorized" ---

  it("authorized sin pago, ciclo vigente NO cobrado (reintento futuro) → PAST_DUE + PAYMENT_MISSED", () => {
    // MP sigue authorized y reprogramó el próximo cobro al futuro, pero el último
    // cobro exitoso es de hace >1 ciclo → el cobro del ciclo vigente no entró.
    const futureRetry = new Date(Date.now() + 30 * 86400_000).toISOString()
    const lastCharged = new Date(Date.now() - 45 * 86400_000).toISOString()
    const out = transitionFromMP(mp({
      status: "authorized",
      next_payment_date: futureRetry,
      summarized: { last_charged_date: lastCharged },
    }))
    expect(out.subscription_status).toBe("PAST_DUE")
    expect(out.event_type).toBe("PAYMENT_MISSED")
    // NO estira al reintento futuro: paid-through = último cobro + 1 ciclo (pasado).
    expect(new Date(out.current_period_ends_at!).getTime())
      .toBeLessThan(new Date(futureRetry).getTime())
  })

  it("authorized sin pago pero último cobro cubre el ciclo → ACTIVE (no corta)", () => {
    const futureNext = new Date(Date.now() + 30 * 86400_000).toISOString()
    const lastCharged = new Date().toISOString() // cobro recién hecho
    const out = transitionFromMP(mp({
      status: "authorized",
      next_payment_date: futureNext,
      summarized: { last_charged_date: lastCharged },
    }))
    expect(out.subscription_status).toBe("ACTIVE")
    expect(out.current_period_ends_at).toBe(futureNext)
  })

  it("authorized sin last_charged_date → ACTIVE (conservador, no corta sub nueva)", () => {
    const futureNext = new Date(Date.now() + 30 * 86400_000).toISOString()
    const out = transitionFromMP(mp({ status: "authorized", next_payment_date: futureNext }))
    expect(out.subscription_status).toBe("ACTIVE")
  })

  it("ciclo impago con preserved corrompido al futuro → usa paidThrough, no el futuro", () => {
    const futureRetry = new Date(Date.now() + 30 * 86400_000).toISOString()
    const lastCharged = new Date(Date.now() - 45 * 86400_000).toISOString()
    const corruptedFuture = new Date(Date.now() + 60 * 86400_000).toISOString()
    const out = transitionFromMP(
      mp({ status: "authorized", next_payment_date: futureRetry, summarized: { last_charged_date: lastCharged } }),
      undefined,
      { preserved_current_period_ends_at: corruptedFuture }
    )
    expect(out.subscription_status).toBe("PAST_DUE")
    expect(new Date(out.current_period_ends_at!).getTime())
      .toBeLessThan(new Date(corruptedFuture).getTime())
  })

  // --- Trial extendido (DB trial_ends_at posterior a next_payment_date de MP) ---

  it("trial extendido: next_payment_date pasó pero trial_ends_at vigente → TRIALING (usa fecha extendida)", () => {
    const pastDate = new Date(Date.now() - 86400_000).toISOString()   // MP cree que terminó ayer
    const futureDate = new Date(Date.now() + 7 * 86400_000).toISOString() // admin extendió +7 días
    const out = transitionFromMP(
      mp({
        status: "authorized",
        auto_recurring: {
          frequency: 1, frequency_type: "months",
          transaction_amount: 119000, currency_id: "ARS",
          free_trial: { frequency: 7, frequency_type: "days" },
        },
        next_payment_date: pastDate,
      }),
      undefined,
      { preserved_current_period_ends_at: pastDate, trial_ends_at: futureDate }
    )
    expect(out.subscription_status).toBe("TRIALING")
    expect(out.current_period_ends_at).toBe(futureDate) // fecha extendida, no la fecha vieja de MP
    expect(out.event_type).toBe("SUBSCRIPTION_AUTHORIZED")
  })

  it("trial extendido: pago rechazado durante extensión vigente → TRIALING", () => {
    const futureDate = new Date(Date.now() + 7 * 86400_000).toISOString()
    const out = transitionFromMP(
      mp({ status: "authorized" }),
      { type: "subscription_authorized_payment", status: "rejected" },
      { preserved_current_period_ends_at: futureDate, trial_ends_at: futureDate }
    )
    expect(out.subscription_status).toBe("TRIALING")
    expect(out.event_type).toBe("PAYMENT_REJECTED_TRIAL_ACTIVE")
    expect(out.current_period_ends_at).toBe(futureDate)
  })

  it("trial expirado (sin extensión): pago rechazado → PAST_DUE", () => {
    const pastDate = new Date(Date.now() - 86400_000).toISOString()
    const out = transitionFromMP(
      mp({ status: "authorized" }),
      { type: "subscription_authorized_payment", status: "rejected" },
      { preserved_current_period_ends_at: pastDate, trial_ends_at: pastDate }
    )
    expect(out.subscription_status).toBe("PAST_DUE")
    expect(out.event_type).toBe("PAYMENT_REJECTED")
  })

  // Regresión defensiva: el downgrade Enterprise→PRO cambia organizations.plan
  // SOLO en el cron apply-scheduled-downgrades. transitionFromMP (webhook/reconcile)
  // jamás debe tocar el plan, ni siquiera si llega un webhook del preapproval cancelado.
  it("nunca devuelve un campo 'plan' (el plan lo gestiona el cron, no el webhook)", () => {
    const out = transitionFromMP(mp({ status: "cancelled" }))
    expect(out).not.toHaveProperty("plan")
  })
})
