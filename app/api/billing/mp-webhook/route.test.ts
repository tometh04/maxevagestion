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
  fetchAuthorizedPayment: jest.fn(),
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
  fetchAuthorizedPayment,
  fetchPreapproval,
} from "@/lib/billing/mercadopago"

const mockCreateAdmin = createAdminClient as jest.Mock
const mockVerify = verifyWebhookSignature as jest.Mock
const mockFetchPayment = fetchPayment as jest.Mock
const mockFetchAuthPayment = fetchAuthorizedPayment as jest.Mock
const mockFetchPreapproval = fetchPreapproval as jest.Mock

/**
 * Admin mock configurable, con maybeSingle sensible a la tabla:
 *  - organizations → cfg.orgData
 *  - billing_events → cfg.maybeSingleData (dup lookup / recentRejection)
 */
function makeAdmin(cfg: { rawInsert?: any; maybeSingleData?: any; orgData?: any; updates?: any[] }) {
  const builder = (table: string): any => {
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
      maybeSingle: () =>
        Promise.resolve({
          data: table === "organizations" ? cfg.orgData ?? null : cfg.maybeSingleData ?? null,
        }),
      update: (payload: any) => {
        if (cfg.updates) cfg.updates.push({ table, payload })
        return { eq: () => Promise.resolve({ error: null }) }
      },
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve(cfg.rawInsert ?? { data: { id: "raw-1" }, error: null }),
        }),
        then: (resolve: any) => resolve(cfg.rawInsert ?? { error: null }),
      }),
    }
    return b
  }
  return { from: (t: string) => builder(t) }
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

  it("un preapproval PENDING no revoca el acceso vigente (PAST_DUE en gracia)", async () => {
    mockVerify.mockReturnValue(true)
    // Org PAST_DUE con gracia vigente (period vence en +2 días → dentro de los 5 de gracia).
    const graceFuture = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()
    mockCreateAdmin.mockReturnValue(
      makeAdmin({
        rawInsert: { data: { id: "raw-1" }, error: null },
        maybeSingleData: null, // recentRejection → null (no toma el path de race condition)
        orgData: {
          id: "org-1",
          name: "Lozada",
          subscription_status: "PAST_DUE",
          current_period_ends_at: graceFuture,
          trial_ends_at: null,
          mp_last_synced_at: null,
        },
      })
    )
    // Preapproval recién creado, pending, atado a la org por external_reference.
    mockFetchPreapproval.mockResolvedValue({
      id: "pa-pending",
      status: "pending",
      external_reference: "org-1",
      last_modified: new Date().toISOString(),
      auto_recurring: { transaction_amount: 119000, currency_id: "ARS" },
    })

    const res = await POST(req("type=subscription_preapproval&data.id=pa-pending"))
    const json = await res.json()
    expect(res.status).toBe(200)
    // Clave: NO baja a PENDING_PAYMENT; preserva el estado con acceso.
    expect(json.preserved_access).toBe(true)
    expect(json.kept_status).toBe("PAST_DUE")
  })

  it("subscription_authorized_payment SIN preapproval_id en el body → busca el authorized_payment y linkea a ACTIVE (caso per-org)", async () => {
    mockVerify.mockReturnValue(true)
    const updates: any[] = []
    mockCreateAdmin.mockReturnValue(
      makeAdmin({
        rawInsert: { data: { id: "raw-1" }, error: null },
        maybeSingleData: null,
        orgData: {
          id: "org-1", name: "Milla Cero", subscription_status: "PAST_DUE",
          current_period_ends_at: null, trial_ends_at: null, mp_last_synced_at: null,
        },
        updates,
      })
    )
    // El webhook trae solo el id del authorized_payment (data.id), sin preapproval_id.
    mockFetchAuthPayment.mockResolvedValue({
      preapproval_id: "pa-perorg",
      status: "processed",
      payment: { id: 170162139791, status: "approved" },
    })
    mockFetchPreapproval.mockResolvedValue({
      id: "pa-perorg", status: "authorized",
      external_reference: "org-1", // resuelve la org por acá
      last_modified: new Date().toISOString(),
      next_payment_date: "2026-08-29T13:36:18.000Z",
      auto_recurring: { transaction_amount: 119000, currency_id: "ARS" },
    })

    const res = await POST(req("type=subscription_authorized_payment&data.id=authpay-1"))
    expect(res.status).toBe(200)
    // Buscó el authorized_payment con el id del webhook.
    expect(mockFetchAuthPayment).toHaveBeenCalledWith("authpay-1")
    // Linkeó: dejó ACTIVE con el preapproval y el vencimiento real.
    const orgUpdate = updates.find((u) => u.table === "organizations" && u.payload.subscription_status)
    expect(orgUpdate).toBeTruthy()
    expect(orgUpdate.payload.subscription_status).toBe("ACTIVE")
    expect(orgUpdate.payload.mp_preapproval_id).toBe("pa-perorg")
    expect(orgUpdate.payload.current_period_ends_at).toBe("2026-08-29T13:36:18.000Z")
  })

  it("subscription_authorized_payment CON preapproval_id en el body → NO llama al fetch nuevo (flujo estándar intacto)", async () => {
    mockVerify.mockReturnValue(true)
    mockCreateAdmin.mockReturnValue(
      makeAdmin({
        rawInsert: { data: { id: "raw-1" }, error: null },
        maybeSingleData: null,
        orgData: {
          id: "org-2", name: "Empresa Mensual", subscription_status: "ACTIVE",
          current_period_ends_at: null, trial_ends_at: null, mp_last_synced_at: null,
        },
      })
    )
    mockFetchPreapproval.mockResolvedValue({
      id: "pa-std", status: "authorized", external_reference: "org-2",
      last_modified: new Date().toISOString(),
      next_payment_date: "2026-09-01T00:00:00Z",
      auto_recurring: { transaction_amount: 119000, currency_id: "ARS" },
    })

    // El body trae preapproval_id → no debe tocar el authorized_payment endpoint.
    const r = new Request("http://localhost/api/billing/mp-webhook?type=subscription_authorized_payment&data.id=authpay-2", {
      method: "POST",
      body: JSON.stringify({ preapproval_id: "pa-std", status: "approved" }),
    })
    const res = await POST(r)
    expect(res.status).toBe(200)
    expect(mockFetchAuthPayment).not.toHaveBeenCalled()
    expect(mockFetchPreapproval).toHaveBeenCalledWith("pa-std")
  })
})
