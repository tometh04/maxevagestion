/** @jest-environment node */

import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"

jest.mock("@/lib/permissions/request", () => ({
  getRequestPermissions: jest.fn(),
}))
jest.mock("@/lib/permissions-api", () => ({
  canPerformAction: jest.fn(),
}))

import { POST as uploadUrlPost } from "@/app/api/library/resources/upload-url/route"
import { POST as categoriesPost } from "@/app/api/library/categories/route"
import { GET as categoriesGet } from "@/app/api/library/categories/route"

const mockPerms = getRequestPermissions as jest.Mock
const mockCan = canPerformAction as jest.Mock

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/library/x", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe("library routes — autorización", () => {
  it("400 si el usuario no tiene org_id", async () => {
    mockPerms.mockResolvedValue({
      user: { id: "u1", role: "ADMIN" }, // sin org_id
      supabase: {},
      matrix: null,
    })
    const res = await categoriesGet()
    expect(res.status).toBe(400)
  })

  it("403 en upload-url cuando el rol no puede gestionar (write=false)", async () => {
    mockPerms.mockResolvedValue({
      user: { id: "u1", role: "SELLER", org_id: "org1", roles: ["SELLER"] },
      supabase: {},
      matrix: null,
    })
    // read=true, write=false
    mockCan.mockImplementation((_u, _m, perm) => perm === "read")

    const res = await uploadUrlPost(
      jsonRequest({ fileName: "x.pdf", mimeType: "application/pdf" })
    )
    expect(res.status).toBe(403)
  })

  it("403 al crear categoría cuando el rol no puede gestionar", async () => {
    mockPerms.mockResolvedValue({
      user: { id: "u1", role: "SELLER", org_id: "org1", roles: ["SELLER"] },
      supabase: {},
      matrix: null,
    })
    mockCan.mockImplementation((_u, _m, perm) => perm === "read")

    const res = await categoriesPost(jsonRequest({ name: "Nueva" }))
    expect(res.status).toBe(403)
  })

  it("403 si el rol ni siquiera tiene lectura del módulo", async () => {
    mockPerms.mockResolvedValue({
      user: { id: "u1", role: "SELLER", org_id: "org1", roles: ["SELLER"] },
      supabase: {},
      matrix: null,
    })
    mockCan.mockReturnValue(false) // read=false

    const res = await categoriesGet()
    expect(res.status).toBe(403)
  })
})
