/**
 * @jest-environment node
 */

jest.mock("./mercadopago", () => ({
  fetchPreapproval: jest.fn(),
  searchPreapprovalsByPayerEmail: jest.fn(),
}))

import { relinkPreapproval } from "./relink-preapproval"
import { fetchPreapproval, searchPreapprovalsByPayerEmail } from "./mercadopago"

const mockFetchPreapproval = fetchPreapproval as jest.Mock
const mockSearch = searchPreapprovalsByPayerEmail as jest.Mock

/**
 * Mock mínimo del admin client (chainable). Configurable por test.
 */
function makeAdmin(config: {
  org?: any
  orgUpdateError?: any
  insertError?: any
}) {
  const updates: any[] = []
  const inserts: any[] = []
  const builder = (table: string): any => {
    const b: any = {
      _table: table,
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      gte: () => b,
      contains: () => b,
      maybeSingle: () =>
        Promise.resolve({ data: table === "organizations" ? config.org ?? null : null }),
      single: () => Promise.resolve({ data: null }),
      update: (u: any) => {
        updates.push({ table, u })
        return { eq: () => Promise.resolve({ error: config.orgUpdateError ?? null }) }
      },
      insert: (row: any) => {
        inserts.push({ table, row })
        return Promise.resolve({ error: config.insertError ?? null })
      },
    }
    return b
  }
  return { from: (t: string) => builder(t), _updates: updates, _inserts: inserts }
}

const authorizedPreapproval = {
  id: "pa-123",
  status: "authorized",
  external_reference: "",
  last_modified: "2026-07-10T10:00:00Z",
  auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 119000, currency_id: "ARS" },
  next_payment_date: "2026-08-10T10:00:00Z",
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("relinkPreapproval", () => {
  it("linkea una org sin mp_preapproval_id buscando por billing_email", async () => {
    mockSearch.mockResolvedValue([{ id: "pa-123", status: "authorized", last_modified: "2026-07-10T10:00:00Z" }])
    mockFetchPreapproval.mockResolvedValue(authorizedPreapproval)

    const admin = makeAdmin({
      org: {
        id: "org-1",
        name: "Test",
        billing_email: "pagador@test.com",
        plan: "PRO",
        subscription_status: "PENDING_PAYMENT",
        mp_preapproval_id: null,
        current_period_ends_at: null,
        mp_last_synced_at: null,
        trial_ends_at: null,
      },
    })

    const res = await relinkPreapproval({
      admin: admin as any,
      orgId: "org-1",
      auditEventType: "MANUAL_ADMIN_ADJUSTMENT",
      source: "test",
    })

    expect(mockSearch).toHaveBeenCalledWith("pagador@test.com", 10)
    expect(res.linked).toBe(true)
    expect(res.from_status).toBe("PENDING_PAYMENT")
    // authorized + free trial ausente → ACTIVE
    expect(res.to_status).toBe("ACTIVE")
    // persistió mp_preapproval_id y auditó
    const orgUpdate = admin._updates.find((u) => u.table === "organizations")
    expect(orgUpdate.u.mp_preapproval_id).toBe("pa-123")
    const audit = admin._inserts.find((i) => i.table === "billing_events")
    expect(audit.row.event_type).toBe("MANUAL_ADMIN_ADJUSTMENT")
  })

  it("rechaza preapproval de otra org (cross-tenant guard)", async () => {
    mockFetchPreapproval.mockResolvedValue({ ...authorizedPreapproval, external_reference: "otra-org" })

    const admin = makeAdmin({
      org: { id: "org-1", billing_email: "x@test.com", subscription_status: "PENDING_PAYMENT", mp_preapproval_id: null },
    })

    const res = await relinkPreapproval({
      admin: admin as any,
      orgId: "org-1",
      preapprovalId: "pa-123",
      auditEventType: "MANUAL_ADMIN_ADJUSTMENT",
      source: "test",
    })

    expect(res.linked).toBe(false)
    expect(res.reason).toBe("external_reference_mismatch")
    expect(admin._updates.length).toBe(0)
  })

  it("no linkea si hay múltiples authorized ambiguos", async () => {
    mockSearch.mockResolvedValue([
      { id: "pa-a", status: "authorized", last_modified: "2026-07-10T10:00:00Z" },
      { id: "pa-b", status: "authorized", last_modified: "2026-07-09T10:00:00Z" },
    ])

    const admin = makeAdmin({
      org: { id: "org-1", billing_email: "x@test.com", subscription_status: "PENDING_PAYMENT", mp_preapproval_id: null },
    })

    const res = await relinkPreapproval({
      admin: admin as any,
      orgId: "org-1",
      auditEventType: "RECONCILED",
      source: "test",
    })

    expect(res.linked).toBe(false)
    expect(res.reason).toBe("ambiguous_candidates")
  })

  it("devuelve no_preapproval_in_mp cuando MP no tiene nada", async () => {
    mockSearch.mockResolvedValue([])
    const admin = makeAdmin({
      org: { id: "org-1", billing_email: "x@test.com", subscription_status: "PENDING_PAYMENT", mp_preapproval_id: null },
    })

    const res = await relinkPreapproval({
      admin: admin as any,
      orgId: "org-1",
      auditEventType: "RECONCILED",
      source: "test",
    })

    expect(res.linked).toBe(false)
    expect(res.reason).toBe("no_preapproval_in_mp")
  })
})
