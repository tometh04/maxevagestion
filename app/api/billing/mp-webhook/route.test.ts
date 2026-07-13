/**
 * @jest-environment node
 *
 * Route handlers usan WHATWG Request/Response — requiere node env.
 */

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/billing/mercadopago", () => ({
  verifyWebhookSignature: jest.fn(),
  fetchPayment: jest.fn(),
  fetchPreapproval: jest.fn(),
  searchPreapprovalsByPayerEmail: jest.fn(),
}))
jest.mock("@/lib/security/audit", () => ({ logSecurityEvent: jest.fn() }))
jest.mock("@/lib/billing/slack-notify", () => ({ notifyBillingSlack: jest.fn() }))

import { POST } from "./route"
import { createAdminClient } from "@/lib/supabase/server"
import {
  verifyWebhookSignature,
  fetchPayment,
} from "@/lib/billing/mercadopago"

const mockCreateAdmin = createAdminClient as jest.Mock
const mockVerify = verifyWebhookSignature as jest.Mock
const mockFetchPayment = fetchPayment as jest.Mock

/** Admin mock configurable para el raw-event insert + dup lookup. */
function makeAdmin(cfg: { rawInsert?: any; maybeSingleData?: any }) {
  const b: any = {
    select: () => b,
    eq: () => b,
    gte: () => b,
    lt: () => b,
    order: () => b,
    limit: () => b,
    contains: () => b,
    in: () => b,
    not: () => b,
    maybeSingle: () => Promise.resolve({ data: cfg.maybeSingleData ?? null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    insert: () => ({
      select: () => ({
        single: () =>
          Promise.resolve(cfg.rawInsert ?? { data: { id: "raw-1" }, error: null }),
      }),
      then: (resolve: any) => resolve(cfg.rawInsert ?? { error: null }),
    }),
  }
  return { from: () => b }
}

function req(query: string) {
  return new Request(`http://localhost/api/billing/mp-webhook?${query}`, {
    method: "POST",
    body: "{}",
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /api/billing/mp-webhook", () => {
  it("401 con firma inválida", async () => {
    mockVerify.mockReturnValue(false)
    const res = await POST(req("type=payment&data.id=pay-1"))
    expect(res.status).toBe(401)
  })

  it("503 (retryable) cuando el fetch a MP falla — NO 200", async () => {
    mockVerify.mockReturnValue(true)
    mockCreateAdmin.mockReturnValue(makeAdmin({ rawInsert: { data: { id: "raw-1" }, error: null } }))
    mockFetchPayment.mockRejectedValue(new Error("MP timeout"))

    const res = await POST(req("type=payment&data.id=pay-1"))
    // Clave: antes devolvía 200 y MP nunca reintentaba → el cobro se perdía.
    expect(res.status).toBe(503)
  })

  it("short-circuita como duplicate solo si el raw event ya fue procesado", async () => {
    mockVerify.mockReturnValue(true)
    mockCreateAdmin.mockReturnValue(
      makeAdmin({
        rawInsert: { data: null, error: { code: "23505" } },
        maybeSingleData: { id: "raw-1", status: "processed" },
      })
    )

    const res = await POST(req("type=payment&data.id=pay-1"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.duplicate).toBe(true)
    // No debe volver a pegarle a MP.
    expect(mockFetchPayment).not.toHaveBeenCalled()
  })

  it("reprocesa (no duplicate) si el raw event previo quedó en 'received'", async () => {
    mockVerify.mockReturnValue(true)
    mockCreateAdmin.mockReturnValue(
      makeAdmin({
        rawInsert: { data: null, error: { code: "23505" } },
        maybeSingleData: { id: "raw-1", status: "received" },
      })
    )
    mockFetchPayment.mockRejectedValue(new Error("MP timeout"))

    const res = await POST(req("type=payment&data.id=pay-1"))
    // Al reprocesar intenta el fetch de nuevo y, si falla, pide retry (503).
    expect(mockFetchPayment).toHaveBeenCalled()
    expect(res.status).toBe(503)
  })
})
