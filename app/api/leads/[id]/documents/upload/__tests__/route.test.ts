/** @jest-environment node */
import { POST } from "../route"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({ getUserAgencyIds: jest.fn().mockResolvedValue(["agency-1"]) }))
jest.mock("openai", () => jest.fn())

it("rechaza nuevas cotizaciones adjuntas antes de subir archivos o guardar datos", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only"
  try {
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: { id: "user-1", org_id: "org-1", role: "ADMIN" } })
    const query: any = {
      select: jest.fn(() => query), eq: jest.fn(() => query),
      single: jest.fn().mockResolvedValue({ data: { id: "lead-1", agency_id: "agency-1" }, error: null }),
    }
    const storage = { from: jest.fn() }
    const from = jest.fn(() => query)
    ;(createClient as jest.Mock).mockReturnValue({ from, storage })
    const body = new FormData()
    body.set("type", "QUOTATION")
    body.set("file", new Blob(["test"], { type: "application/pdf" }), "cotizacion.pdf")
    const response = await POST(new Request("https://example.com/api/leads/lead-1/documents/upload", { method: "POST", body }),
      { params: Promise.resolve({ id: "lead-1" }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "La carga de cotizaciones adjuntas ya no está disponible" })
    expect(storage.from).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledTimes(1)
    expect(query.eq).toHaveBeenCalledWith("org_id", "org-1")
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  }
})
