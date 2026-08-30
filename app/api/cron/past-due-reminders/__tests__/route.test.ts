/**
 * @jest-environment node
 *
 * Dunning de PAST_DUE. Lo que se protege acá es que el cliente reciba el aviso
 * exactamente una vez por slot (un mail de cobranza duplicado es peor que
 * tardío) y que un envío fallido no queme el slot.
 */
import { POST } from "../route"

jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }))
jest.mock("@/lib/cron/auth", () => ({ checkCronAuth: jest.fn() }))
jest.mock("@/lib/email/email-service", () => ({ sendPaymentFailedEmail: jest.fn() }))
jest.mock("@/lib/billing/slack-notify", () => ({ notifyBillingSlack: jest.fn() }))
jest.mock("@/lib/security/audit", () => ({ logSecurityEvent: jest.fn() }))

import { createAdminClient } from "@/lib/supabase/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { sendPaymentFailedEmail } from "@/lib/email/email-service"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"

const mockAdmin = createAdminClient as jest.Mock
const mockAuth = checkCronAuth as jest.Mock
const mockSend = sendPaymentFailedEmail as jest.Mock
const mockSlack = notifyBillingSlack as jest.Mock

const DAY = 86400_000

function makeReq() {
  return new Request("http://test.local/api/cron/past-due-reminders", {
    method: "POST",
    headers: { authorization: "Bearer test" },
  })
}

interface Harness {
  orgs: any[]
  /** Simula que el slot ya fue reclamado por otra corrida (UNIQUE → 23505). */
  claimConflict?: boolean
  lastRejectionDetail?: string | null
}

function setup(h: Harness) {
  const claims: any[] = []
  const updates: any[] = []
  const deletes: string[] = []

  function from(table: string) {
    const state: any = { table, op: "select", filters: {} }
    const b: any = {}
    const chain = (fn: (s: any, ...a: any[]) => void) => (...args: any[]) => { fn(state, ...args); return b }
    b.select = chain((s) => { if (s.op === "select") s.op = "select" })
    b.insert = chain((s, p) => { s.op = "insert"; s.payload = p })
    b.update = chain((s, p) => { s.op = "update"; s.payload = p })
    b.delete = chain((s) => { s.op = "delete" })
    b.eq = chain((s, c: string, v: any) => { s.filters[c] = v })
    b.in = chain(() => {})
    b.not = chain(() => {})
    b.order = chain(() => {})
    b.limit = chain(() => {})
    b.maybeSingle = chain(() => {})
    b.single = chain(() => {})
    b.then = (resolve: any, reject: any) => {
      let out: any = { data: null, error: null }
      if (state.table === "organizations") {
        out = { data: h.orgs, error: null }
      } else if (state.table === "billing_events") {
        if (state.op === "insert") {
          if (h.claimConflict) {
            out = { data: null, error: { code: "23505" } }
          } else {
            claims.push(state.payload)
            out = { data: { id: `claim-${claims.length}` }, error: null }
          }
        } else if (state.op === "update") {
          updates.push({ id: state.filters.id, payload: state.payload })
        } else if (state.op === "delete") {
          deletes.push(state.filters.id)
        } else {
          // Lookup del último rechazo, para el motivo.
          out = {
            data: h.lastRejectionDetail
              ? { payload: { payment_event: { status_detail: h.lastRejectionDetail } } }
              : null,
            error: null,
          }
        }
      }
      return Promise.resolve(out).then(resolve, reject)
    }
    return b
  }

  mockAdmin.mockReturnValue({ from })
  return { claims, updates, deletes }
}

function orgAt(offsetDays: number, extra: Record<string, any> = {}) {
  // current_period_ends_at ubicado para que "ahora" caiga en offsetDays de gracia.
  return {
    id: "org-1",
    name: "Milla Cero",
    billing_email: "facturacion@test.com",
    plan: "PRO",
    current_period_ends_at: new Date(Date.now() - offsetDays * DAY).toISOString(),
    agreed_plan_price_ars: 119000,
    ...extra,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockReturnValue({ authorized: true })
  mockSend.mockResolvedValue({ success: true, id: "email-1" })
})

it("rechaza sin CRON_SECRET válido", async () => {
  mockAuth.mockReturnValue({ authorized: false, reason: "bad token" })
  setup({ orgs: [] })
  const res = await POST(makeReq())
  expect(res.status).toBe(401)
  expect(mockSend).not.toHaveBeenCalled()
})

it("manda el aviso con el motivo real del rechazo", async () => {
  setup({ orgs: [orgAt(0)], lastRejectionDetail: "cc_rejected_insufficient_amount" })
  const res = await POST(makeReq())
  const body = await res.json()

  expect(body.sent).toBe(1)
  expect(mockSend).toHaveBeenCalledTimes(1)
  const [to, name, opts] = mockSend.mock.calls[0]
  expect(to).toBe("facturacion@test.com")
  expect(name).toBe("Milla Cero")
  expect(opts.reasonLabel).toBe("Fondos insuficientes")
  expect(opts.amountArs).toBe(119000)
})

it("no manda dos veces el mismo slot si otra corrida ya lo reclamó", async () => {
  setup({ orgs: [orgAt(0)], claimConflict: true })
  const res = await POST(makeReq())
  const body = await res.json()

  expect(body.sent).toBe(0)
  expect(body.skipped).toBe(1)
  expect(mockSend).not.toHaveBeenCalled()
})

it("calla en los días intermedios de la gracia", async () => {
  setup({ orgs: [orgAt(1)] })
  const body = await (await POST(makeReq())).json()
  expect(body.sent).toBe(0)
  expect(mockSend).not.toHaveBeenCalled()
})

it("libera el slot cuando el mail no sale, para poder reintentarlo", async () => {
  mockSend.mockResolvedValue({ success: false, error: "resend caído" })
  const { deletes } = setup({ orgs: [orgAt(0)] })
  const body = await (await POST(makeReq())).json()

  expect(body.failed).toBe(1)
  expect(deletes).toHaveLength(1)
})

it("agotada la gracia escala a Slack en vez de mandar otro mail", async () => {
  setup({ orgs: [orgAt(6)] })
  const body = await (await POST(makeReq())).json()

  expect(body.escalated).toBe(1)
  expect(mockSend).not.toHaveBeenCalled()
  expect(mockSlack).toHaveBeenCalledTimes(1)
  expect(mockSlack.mock.calls[0][0].severity).toBe("error")
})

it("sin billing_email avisa a un humano en vez de fallar en silencio", async () => {
  setup({ orgs: [orgAt(0, { billing_email: null })] })
  const body = await (await POST(makeReq())).json()

  expect(body.sent).toBe(0)
  expect(body.skipped).toBe(1)
  expect(mockSlack).toHaveBeenCalledTimes(1)
})
