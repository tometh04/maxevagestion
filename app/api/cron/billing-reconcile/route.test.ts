/**
 * @jest-environment node
 *
 * Regresión del fix "mes gratis": el reconcile no debe revivir ACTIVE ni estirar
 * la fecha al reintento cuando el ciclo vigente no se cobró; debe cortar proactivo
 * a PAST_DUE con CAS guard; y respetar el recovery cuando un webhook ganó la carrera.
 */
import { POST } from "./route"

jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }))
jest.mock("@/lib/billing/mercadopago", () => ({ fetchPreapproval: jest.fn() }))
jest.mock("@/lib/cron/auth", () => ({ checkCronAuth: jest.fn() }))
jest.mock("@/lib/billing/slack-notify", () => ({ notifyBillingSlack: jest.fn() }))
jest.mock("@/lib/billing/relink-preapproval", () => ({ relinkPreapproval: jest.fn() }))

import { createAdminClient } from "@/lib/supabase/server"
import { fetchPreapproval } from "@/lib/billing/mercadopago"
import { checkCronAuth } from "@/lib/cron/auth"

const mockAdmin = createAdminClient as jest.Mock
const mockFetch = fetchPreapproval as jest.Mock
const mockAuth = checkCronAuth as jest.Mock

function makeReq() {
  return new Request("http://test.local/api/cron/billing-reconcile", {
    method: "POST",
    headers: { authorization: "Bearer test" },
  })
}

/** Builder encadenable que resuelve según (tabla, op, filtros) vía `resolver`. */
function makeChainable(resolver: (state: any) => any) {
  function from(table: string) {
    const state: any = { table, op: "select", filters: {} }
    const b: any = {}
    const chain = (fn: (s: any, ...a: any[]) => void) => (...args: any[]) => { fn(state, ...args); return b }
    b.select = chain((s) => { if (s.op !== "update" && s.op !== "insert") s.op = "select" })
    b.insert = chain((s, p) => { s.op = "insert"; s.payload = p })
    b.update = chain((s, p) => { s.op = "update"; s.payload = p })
    b.in = chain((s, c: string, v: any) => { s.filters[c] = v })
    b.not = chain((s) => { s.notCalled = true })
    b.eq = chain((s, c: string, v: any) => { s.filters[c] = v })
    b.lt = chain((s) => { s.ltCalled = true })
    b.gte = chain(() => {})
    b.order = chain(() => {})
    b.limit = chain(() => {})
    b.maybeSingle = chain((s) => { s.single = true })
    b.single = chain((s) => { s.single = true })
    b.then = (resolve: any, reject: any) => Promise.resolve(resolver(state)).then(resolve, reject)
    return b
  }
  return { from }
}

const DAY = 86400_000
const iso = (ms: number) => new Date(ms).toISOString()

/** Corre el reconcile con UNA org y devuelve response + billing_events insertados. */
async function runReconcile(opts: { org: any; pa: any; casMatches: boolean }) {
  const inserts: any[] = []
  const updates: any[] = []
  const resolver = (state: any) => {
    const { table, op, filters } = state
    if (table === "organizations" && op === "select") {
      if (state.notCalled) return { data: [opts.org], error: null } // Fase 1
      return { data: [], error: null } // Fase 2 (TRIALING expirados)
    }
    if (table === "organizations" && op === "update") {
      updates.push({ payload: state.payload, filters })
      if (!state.selectCalledAfterUpdate && !("id" in filters)) return { data: null, error: null }
      return { data: opts.casMatches ? [{ id: filters.id }] : [], error: null } // CAS
    }
    if (table === "billing_events" && op === "select") return { data: [], error: null } // Fase 3
    if (table === "billing_events" && op === "insert") { inserts.push(state.payload); return { error: null } }
    return { data: [], error: null }
  }
  mockAdmin.mockReturnValue(makeChainable(resolver))
  mockFetch.mockResolvedValue(opts.pa)
  const res = await POST(makeReq())
  const body = await res.json()
  return { res, body, inserts, updates, orgResult: body.results?.[0] }
}

const basePa = (over: any = {}) => ({
  id: "pa_1",
  status: "authorized",
  external_reference: "org_1",
  last_modified: "2026-07-27T00:00:00Z",
  auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 119000, currency_id: "ARS" },
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockReturnValue({ authorized: true })
})

describe("POST /api/cron/billing-reconcile — fix mes gratis", () => {
  it("401 sin CRON_SECRET válido", async () => {
    mockAuth.mockReturnValue({ authorized: false, reason: "bad token" })
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it("NO mes gratis: org PAST_DUE + MP authorized con reintento futuro y último cobro viejo → no revive ACTIVE", async () => {
    const now = Date.now()
    const org = {
      id: "org_1", name: "Milla Cero", subscription_status: "PAST_DUE",
      current_period_ends_at: iso(now - 5 * DAY), mp_preapproval_id: "pa_1",
      mp_last_synced_at: "2026-07-27T00:00:00Z", trial_ends_at: null,
    }
    const pa = basePa({ next_payment_date: iso(now + 30 * DAY), summarized: { last_charged_date: iso(now - 45 * DAY) } })
    const { orgResult, inserts } = await runReconcile({ org, pa, casMatches: true })
    // transition da PAST_DUE == status actual → changed=false → no se flipa a ACTIVE.
    expect(orgResult.drifted).toBe(false)
    expect(orgResult.to).toBe("PAST_DUE")
    expect(inserts.some((i) => i.event_type === "PAYMENT_MISSED")).toBe(false)
  })

  it("corte proactivo: org ACTIVE (bug la había revivido) con ciclo impago → PAST_DUE + PAYMENT_MISSED con CAS", async () => {
    const now = Date.now()
    const org = {
      id: "org_1", name: "Afectada", subscription_status: "ACTIVE",
      current_period_ends_at: iso(now + 30 * DAY), mp_preapproval_id: "pa_1",
      mp_last_synced_at: "2026-07-01T00:00:00Z", trial_ends_at: null,
    }
    const pa = basePa({ next_payment_date: iso(now + 30 * DAY), summarized: { last_charged_date: iso(now - 45 * DAY) } })
    const { orgResult, inserts, updates } = await runReconcile({ org, pa, casMatches: true })
    expect(orgResult.drifted).toBe(true)
    expect(orgResult.to).toBe("PAST_DUE")
    expect(orgResult.payment_missed).toBe(true)
    // CAS: el update filtra por el status previo.
    expect(updates.some((u) => u.filters.subscription_status === "ACTIVE")).toBe(true)
    const missed = inserts.find((i) => i.event_type === "PAYMENT_MISSED")
    expect(missed).toBeTruthy()
    expect(missed.payload.previous_status).toBe("ACTIVE")
    expect(missed.payload.new_status).toBe("PAST_DUE")
    expect(missed.payload.reason).toBe("payment_missed")
  })

  it("recovery race: transition daría ACTIVE pero el status cambió en el medio (CAS 0 filas) → no aplica", async () => {
    const now = Date.now()
    const org = {
      id: "org_1", name: "Recovered", subscription_status: "PAST_DUE",
      current_period_ends_at: iso(now - 2 * DAY), mp_preapproval_id: "pa_1",
      mp_last_synced_at: "2026-07-01T00:00:00Z", trial_ends_at: null,
    }
    // último cobro reciente → cubre el ciclo → transition = ACTIVE (recovery).
    const pa = basePa({ next_payment_date: iso(now + 28 * DAY), summarized: { last_charged_date: iso(now) } })
    const { orgResult, inserts } = await runReconcile({ org, pa, casMatches: false })
    expect(orgResult.drifted).toBe(false) // CAS devolvió 0 filas → no se aplicó
    expect(inserts.length).toBe(0)
  })

  it("conservador: ACTIVE + authorized + sin last_charged_date + próximo cobro vencido → alerta, NO corta", async () => {
    const now = Date.now()
    const org = {
      id: "org_1", name: "SinCobro", subscription_status: "ACTIVE",
      current_period_ends_at: iso(now + 10 * DAY), mp_preapproval_id: "pa_1",
      mp_last_synced_at: "2026-07-27T00:00:00Z", trial_ends_at: null,
    }
    // Sin summarized.last_charged_date, next_payment vencido más allá de la gracia.
    const pa = basePa({ next_payment_date: iso(now - 10 * DAY) })
    const { orgResult, inserts } = await runReconcile({ org, pa, casMatches: true })
    expect(orgResult.drifted).toBe(false) // no se cortó (conservador)
    expect(orgResult.silent_charge_failure).toBe(true) // pero sí alertó
    expect(inserts.some((i) => i.payload?.alert === "silent_charge_failure")).toBe(true)
  })
})
