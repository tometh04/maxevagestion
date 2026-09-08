/** @jest-environment node */
import { POST } from "../route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { interpretQuotationDesign } from "@/lib/quotation-documents/import-design"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({ resolveAgencyPermissionScope: jest.fn() }))
jest.mock("@/lib/quotation-documents/import-design", () => ({ interpretQuotationDesign: jest.fn() }))
jest.mock("openai", () => ({ __esModule: true, default: jest.fn() }))

const agencyId = "fabbc2e7-81d8-4ca1-85b2-7809c5f88e75"
const orgId = "1b326d20-d133-4112-a798-f54b5af7e7cb"
const originalKey = process.env.OPENAI_API_KEY
let query: { select: jest.Mock; eq: jest.Mock; maybeSingle: jest.Mock }
let from: jest.Mock

function request(id = agencyId) {
  const form = new FormData()
  form.append("agency_id", id)
  form.append("file", new File(["%PDF-reference"], "model.pdf", { type: "application/pdf" }))
  return new Request("http://localhost/api/quotation-document-models/import", { method: "POST", body: form })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.OPENAI_API_KEY = "test-placeholder"
  query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: { id: agencyId, name: "Madero" } }) }
  from = jest.fn().mockReturnValue(query)
  jest.mocked(getCurrentUser).mockResolvedValue({ user: { id: "user", org_id: orgId } } as never)
  jest.mocked(createServerClient).mockResolvedValue({ from } as never)
  jest.mocked(resolveAgencyPermissionScope).mockResolvedValue({ agencyIds: [agencyId] } as never)
  jest.mocked(interpretQuotationDesign).mockResolvedValue({ layoutKey: "travel-summary-v1" } as never)
})
afterAll(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey })

it("requires settings permission before reading the upload or calling AI", async () => {
  jest.mocked(resolveAgencyPermissionScope).mockResolvedValue({ agencyIds: [] } as never)
  const response = await POST(request())
  expect(response.status).toBe(403)
  expect(interpretQuotationDesign).not.toHaveBeenCalled()
  expect(from).not.toHaveBeenCalled()
})

it("preserves the authentication redirect before reading the upload", async () => {
  const error = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/api/auth/unauthorized;307;" })
  jest.mocked(getCurrentUser).mockRejectedValueOnce(error)
  await expect(POST(request())).rejects.toBe(error)
  expect(interpretQuotationDesign).not.toHaveBeenCalled()
})

it("rejects a different agency even if it belongs to the same organization", async () => {
  const response = await POST(request("66563aeb-4e8b-40ee-a622-b39defb380dd"))
  expect(response.status).toBe(403)
  expect(interpretQuotationDesign).not.toHaveBeenCalled()
})

it("checks both organization and agency and returns a draft without persisting it", async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(query.eq).toHaveBeenCalledWith("org_id", orgId)
  expect(query.eq).toHaveBeenCalledWith("id", agencyId)
  expect(from.mock.calls).toEqual([["agencies"]])
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual({ manifest: { layoutKey: "travel-summary-v1" } })
})

it("does not expose provider errors or return a partial manifest", async () => {
  jest.mocked(interpretQuotationDesign).mockRejectedValue(new Error("private provider diagnostic"))
  const response = await POST(request())
  expect(response.status).toBe(502)
  expect(await response.text()).not.toContain("private provider diagnostic")
})
