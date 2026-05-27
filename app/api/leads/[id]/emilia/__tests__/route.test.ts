// app/api/leads/[id]/emilia/__tests__/route.test.ts
/**
 * @jest-environment node
 *
 * API route handlers use WHATWG Request/Response — requires node env (not jsdom).
 * The handlers in this route ignore the _req parameter (prefixed _), so we pass
 * a plain object stub instead of `new Request(...)` to avoid the global Request
 * dependency in jest-environment-node's VM context.
 */

// Mock next/server to provide a simple NextResponse.json that doesn't require
// the global Request class (which is not available in jest-environment-node's VM).
jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      const status = init?.status ?? 200
      return {
        status,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
}))
jest.mock("@/lib/settings/org-features", () => ({
  getOrgFeatureFlag: jest.fn(),
}))

import { GET, POST } from "../route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")
const { getOrgFeatureFlag } = require("@/lib/settings/org-features")

const USER_ORG = "org-beta"
const OTHER_ORG = "org-other"
const LEAD_ID = "lead-1"

// The route handlers don't use _req (prefixed underscore = unused).
// Pass a plain stub to avoid needing the global Request constructor.
const REQ_STUB = {} as Request

function mockSupabase(builders: Record<string, any>) {
  return {
    from: jest.fn((table: string) => builders[table] ?? ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => ({ data: null }) }) }) }) }) }) }),
    })),
  }
}

describe("/api/leads/[id]/emilia", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = "" // forzar fallback en tests
  })

  it("GET 400 si user sin org_id", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: null } })
    createServerClient.mockResolvedValue({})
    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(400)
  })

  it("GET 403 si flag OFF", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    createServerClient.mockResolvedValue({})
    getOrgFeatureFlag.mockResolvedValue(false)
    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/beta/i)
  })

  it("GET 404 si lead pertenece a otro org", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    getOrgFeatureFlag.mockResolvedValue(true)
    createServerClient.mockResolvedValue(mockSupabase({
      leads: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: LEAD_ID, agency_id: "a1", agencies: { org_id: OTHER_ORG } },
            }),
          }),
        }),
      },
    }))
    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(404)
  })

  it("GET 200 con null si lead OK pero no hay conversación", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    getOrgFeatureFlag.mockResolvedValue(true)
    createServerClient.mockResolvedValue(mockSupabase({
      leads: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: LEAD_ID, agency_id: "a1", agencies: { org_id: USER_ORG } },
            }),
          }),
        }),
      },
      conversations: {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
        }),
      },
    }))
    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeNull()
  })

  it("POST crea conversación nueva y devuelve fallback prompt", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    getOrgFeatureFlag.mockResolvedValue(true)
    createServerClient.mockResolvedValue(mockSupabase({
      leads: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: LEAD_ID,
                contact_name: "Juan",
                destination: "Cancún",
                region: "CARIBE",
                notes: null,
                agency_id: "a1",
                agencies: { org_id: USER_ORG },
              },
            }),
          }),
        }),
      },
      conversations: {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
        }),
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: "conv-new" } }) }),
        }),
      },
    }))
    const res = await POST(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversation_id).toBe("conv-new")
    expect(body.suggested_prompt).toMatch(/Cancún/)
  })

  it("POST reusa conversación existente cuando ya hay una active", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    getOrgFeatureFlag.mockResolvedValue(true)

    const insertSpy = jest.fn()

    createServerClient.mockResolvedValue(mockSupabase({
      leads: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: LEAD_ID,
                contact_name: "Juan",
                destination: "Cancún",
                region: "CARIBE",
                notes: null,
                agency_id: "a1",
                agencies: { org_id: USER_ORG },
              },
            }),
          }),
        }),
      },
      conversations: {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: "conv-existing" } }) }) }) }) }) }),
        }),
        insert: insertSpy,
      },
    }))

    const res = await POST(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversation_id).toBe("conv-existing")
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
