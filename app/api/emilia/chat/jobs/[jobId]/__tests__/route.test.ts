/** @jest-environment node */
import { GET } from "../route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/emilia/access", () => ({
  resolveLeadEmiliaAccess: async () => ({ allowed: true }),
  canAccessEmiliaLeadAgency: () => true,
  resolveEmiliaOrganizationAccess: async () => ({ allowed: true }),
}))
jest.mock("@/lib/emilia/agency-credential", () => ({ resolveAgencyEmiliaCredential: async () => ({ apiKey: "test-key" }) }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({ resolveAgencyPermissionScope: jest.fn() }))

const job = "11111111-1111-4111-8111-111111111111"
const conversation = "22222222-2222-4222-8222-222222222222"
let missingConversation: boolean
let filters: Array<[string, string, unknown]>
let inserts: any[]
const response = () => GET(new Request(`http://localhost/api/emilia/chat/jobs/${job}?conversationId=${conversation}`),
  { params: Promise.resolve({ jobId: job }) })
const upstream = (external = conversation, failed = false) => ({
  status: failed ? "failed" : "processing", job_id: job, external_conversation_ref: external, request_id: "request-1", attempt: 1,
  error: failed ? { message: "No pudimos completar la búsqueda" } : undefined,
  progress: { version: 102, attempt: 1, requested_products: ["flights", "hotels"],
    results: { result_sets: [{ product: "flights", status: "available", query: { adults: 2 },
      data: [{ id: "flight-1", provider: "STARLING", price: { amount: 100, currency: "USD" }, legs: [] }] }] } },
})

beforeEach(() => {
  missingConversation = false; filters = []; inserts = []
  jest.mocked(getCurrentUser).mockResolvedValue({ user: { id: "user-1", org_id: "org-1" } } as never)
  jest.mocked(createServerClient).mockResolvedValue({ from: (table: string) => {
    const chain = {
      select: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(),
      eq: (column: string, value: unknown) => { filters.push([table, column, value]); return chain },
      single: async () => ({ data: missingConversation ? null : { id: conversation, lead_id: "lead-1" }, error: null }),
      maybeSingle: async () => ({ data: table === "leads" ? { id: "lead-1", agency_id: "agency-1" } : null, error: null }),
      insert: async (value: unknown) => { inserts.push(value); return { error: null } },
    }
    return chain
  } } as never)
  global.fetch = jest.fn(async () => new Response(JSON.stringify(upstream()), { status: 200 }))
})
afterEach(() => jest.clearAllMocks())

it("requires organization and conversation ownership before requesting any previews", async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({ user: { id: "user-1", org_id: null } } as never)
  expect((await response()).status).toBe(400)
  expect(global.fetch).not.toHaveBeenCalled()
  jest.mocked(getCurrentUser).mockResolvedValue({ user: { id: "user-1", org_id: "org-1" } } as never)
  missingConversation = true
  expect((await response()).status).toBe(404)
  expect(filters).toEqual(expect.arrayContaining([["conversations", "org_id", "org-1"], ["conversations", "user_id", "user-1"]]))
  expect(global.fetch).not.toHaveBeenCalled()
})

it("does not return another conversation's progress", async () => {
  jest.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify(upstream("other-conversation"))))
  const result = await response()
  expect(result.status).toBe(404)
  expect(await result.json()).not.toHaveProperty("results")
})

it("returns normalized partial cards only after the existing scope checks", async () => {
  const result = await response()
  expect(result.status).toBe(200)
  expect(await result.json()).toMatchObject({ status: "processing", attempt: 1,
    progress: { version: 102, products: { flights: "available", hotels: "searching" } },
    results: { flights: { items: [{ id: "flight-1", price: { amount: 100 } }] } },
  })
  expect(filters).toContainEqual(["leads", "org_id", "org-1"])
  expect(inserts).toHaveLength(0)
})

it("persists partial cards on a terminal upstream HTTP failure so reopen retains them", async () => {
  jest.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify(upstream(conversation, true)), { status: 502 }))
  const result = await response()
  expect(result.status).toBe(200)
  expect(await result.json()).toMatchObject({ status: "failed", progress: { version: 102 } })
  expect(inserts).toHaveLength(1)
  expect(inserts[0]).toMatchObject({ conversation_id: conversation, role: "assistant",
    content: { cards: { flights: { items: [{ id: "flight-1" }] } }, metadata: { emilia_job: { status: "failed" } } },
  })
})
