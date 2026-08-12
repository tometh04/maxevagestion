import type { AnalyticsEventName, AnalyticsEventParams } from "../events"
import { scrubParams } from "../scrub"

/**
 * Muestra representativa de CADA evento del catalogo.
 *
 * El tipo es un mapped type sobre `AnalyticsEventName`, asi que agregar un
 * evento en `events.ts` sin agregarlo aca no compila. Eso es a proposito: el
 * test de abajo es la unica cosa que detecta el fallo silencioso de declarar un
 * parametro perfectamente valido en TypeScript que despues `scrubParams`
 * descarta en runtime (ej. llamarlo `has_cuit` en vez de `has_tax_id`), con lo
 * cual el dato nunca llega a GA y nadie se entera.
 */
const SAMPLES: { [K in AnalyticsEventName]: AnalyticsEventParams[K] } = {
  login: { method: "password" },
  sign_up: { method: "email" },
  onboarding_org_created: {
    plan_id: "STARTER",
    has_billing_contact: true,
    has_tax_id: false,
  },
  plan_selected: { plan_id: "PRO", surface: "onboarding" },
  checkout_started: { plan_id: "PRO", regularize: false, surface: "paywall" },
  checkout_returned: { plan_id: "PRO", result: "done" },
  lead_created: { source_channel: "manychat", has_agency_assigned: true },
  lead_stage_changed: { from_stage: "nuevo", to_stage: "cotizado", board: "manychat" },
  lead_converted: { sale_currency: "USD", had_quote: true },
  operation_created: {
    passengers_bucket: "2-5",
    services_bucket: "1",
    multi_operator: false,
    sale_currency: "USD",
    from_lead: true,
    had_warnings: false,
  },
  payment_registered: {
    currency: "ARS",
    payment_method: "transfer",
    requires_approval: false,
    surface: "payments",
  },
  payment_marked_paid: { currency: "USD", surface: "payments" },
  invoice_authorized: { invoice_kind: "6", result: "error", surface: "invoices" },
  quotation_created: { mode: "create", sent: true, items_bucket: "2-5" },
  import_run: { entity: "operations", rows_bucket: "25+", result: "partial" },
  ai_query_submitted: { surface: "cerebro", has_context: true },
}

describe("catalogo de eventos", () => {
  const entries = Object.entries(SAMPLES) as Array<
    [AnalyticsEventName, Record<string, unknown>]
  >

  it.each(entries)("%s no pierde ningun parametro al pasar por el scrubber", (name, params) => {
    const scrubbed = scrubParams(params)
    expect(Object.keys(scrubbed).sort()).toEqual(Object.keys(params).sort())
  })

  it("usa snake_case en todos los nombres de evento", () => {
    for (const name of Object.keys(SAMPLES)) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it("respeta el techo de 25 params por evento de GA4", () => {
    for (const [, params] of entries) {
      expect(Object.keys(params).length).toBeLessThanOrEqual(25)
    }
  })
})
