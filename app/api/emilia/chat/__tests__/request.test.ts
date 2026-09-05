/** @jest-environment node */
import { POST } from "../route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveLeadEmiliaAccess, canAccessEmiliaLeadAgency } from "@/lib/emilia/access"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: jest.fn(() => null) }))
jest.mock("@/lib/emilia/access", () => ({
  resolveLeadEmiliaAccess: jest.fn(), canAccessEmiliaLeadAgency: jest.fn(),
}))
jest.mock("@/lib/emilia/agency-credential", () => ({ resolveAgencyEmiliaCredential: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({ resolveAgencyPermissionScope: jest.fn() }))
jest.mock("@/lib/emilia/turn-result", () => ({ normalizeEmiliaProgress: () => ({}) }))

const conversationId = "11111111-1111-4111-8111-111111111111"
const clientId = "22222222-2222-4222-8222-222222222222"
const message = "Quiero un vuelo a Cancún para dos adultos"

describe("primer mensaje de un lead a Emilia", () => {
  const originalFetch = global.fetch
  let query: Record<string, jest.Mock>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: { id: "user-1", org_id: "org-1" } })
    query = {
      select: jest.fn(), eq: jest.fn(), update: jest.fn(),
      single: jest.fn().mockResolvedValue({ data: { id: conversationId, lead_id: "lead-1" } }),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: "lead-1", agency_id: "agency-1" } }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    }
    for (const key of ["select", "eq", "update"]) query[key].mockReturnValue(query)
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(resolveLeadEmiliaAccess as jest.Mock).mockResolvedValue({ allowed: true })
    ;(canAccessEmiliaLeadAgency as jest.Mock).mockReturnValue(true)
    ;(resolveAgencyEmiliaCredential as jest.Mock).mockResolvedValue({ apiKey: "test-key" })
    global.fetch = jest.fn().mockResolvedValue(Response.json({ status: "queued", job_id: "job-1" }))
  })

  afterEach(() => { global.fetch = originalFetch })

  it.each([null, undefined, { city: "Rosario", country: "Argentina" }])(
    "despacha el primer prompt con origen %j sin Solicitud inválida",
    async (defaultOrigin) => {
      const response = await POST(new Request("http://localhost/api/emilia/chat", {
        method: "POST",
        body: JSON.stringify({ message, conversationId, clientId, defaultOrigin }),
      }))
      const body = await response.json()
      expect(body.error).toBeUndefined()
      expect(response.status).toBe(202)
      const payload = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(payload.message).toBe(defaultOrigin ? `${message} Saliendo desde Rosario, Argentina.` : message)
      expect(query.eq).toHaveBeenCalledWith("org_id", "org-1")
      expect(query.eq).toHaveBeenCalledWith("user_id", "user-1")
    }
  )

  it.each([{ city: "" }, { city: 123 }, "Rosario"])("rechaza origen malformado %j", async (defaultOrigin) => {
    const response = await POST(new Request("http://localhost/api/emilia/chat", {
      method: "POST", body: JSON.stringify({ message, conversationId, clientId, defaultOrigin }),
    }))
    expect(response.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
