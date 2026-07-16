/** @jest-environment node */

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/growth-studio/access", () => ({
  resolveGrowthStudioAccess: jest.fn(),
}))
jest.mock("@/lib/growth-studio/brand-profile-service", () => {
  const actual = jest.requireActual("@/lib/growth-studio/brand-profile-service")
  return {
    ...actual,
    getBrandProfile: jest.fn(),
    saveBrandProfile: jest.fn(),
  }
})

import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveGrowthStudioAccess } from "@/lib/growth-studio/access"
import {
  getBrandProfile,
  saveBrandProfile,
} from "@/lib/growth-studio/brand-profile-service"
import { createEmptyBrandProfileData } from "@/lib/growth-studio/brand-profile-schema"
import { GET, PUT } from "../route"

const agencyId = "7e152aef-a90e-4b87-ac5f-b262d0eea4a9"
const user = {
  id: "598704c5-c253-481b-b93b-6d8cfc3f7728",
  org_id: "b96794d8-160f-4126-a3b1-0062498d25cc",
  role: "VIEWER",
  roles: ["VIEWER"],
}
const access = {
  allowed: true as const,
  organization: {
    id: user.org_id,
    subscription_status: "ACTIVE",
    current_period_ends_at: null,
    trial_ends_at: null,
  },
  agencies: [{ id: agencyId, name: "Centro" }],
  agencyIds: [agencyId],
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getCurrentUser).mockResolvedValue({ user } as never)
  jest.mocked(createServerClient).mockResolvedValue({} as never)
  jest.mocked(resolveGrowthStudioAccess).mockResolvedValue(access)
})

describe("GET /api/growth-studio/brand-profile", () => {
  it("devuelve 400 sin una agencia válida", async () => {
    const response = await GET(new Request("http://localhost/api/growth-studio/brand-profile"))
    expect(response.status).toBe(400)
  })

  it("devuelve 200 y profile null cuando todavía no existe", async () => {
    jest.mocked(getBrandProfile).mockResolvedValue(null)

    const response = await GET(
      new Request(`http://localhost/api/growth-studio/brand-profile?agencyId=${agencyId}`)
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.profile).toBeNull()
    expect(body.data.agency).toEqual({ id: agencyId, name: "Centro" })
  })

  it("devuelve 403 cuando la suscripción del tenant está inactiva", async () => {
    jest.mocked(resolveGrowthStudioAccess).mockResolvedValue({
      allowed: false,
      status: 403,
      code: "subscription_inactive",
      message: "Suscripción inactiva",
    })

    const response = await GET(
      new Request(`http://localhost/api/growth-studio/brand-profile?agencyId=${agencyId}`)
    )
    expect(response.status).toBe(403)
  })
})

describe("PUT /api/growth-studio/brand-profile", () => {
  it("rechaza JSON malformado", async () => {
    const response = await PUT(
      new Request("http://localhost/api/growth-studio/brand-profile", {
        method: "PUT",
        body: "{",
      })
    )
    expect(response.status).toBe(400)
  })

  it("rechaza un payload inválido", async () => {
    const response = await PUT(
      new Request("http://localhost/api/growth-studio/brand-profile", {
        method: "PUT",
        body: JSON.stringify({ agencyId, brandName: "V", data: {} }),
      })
    )
    expect(response.status).toBe(400)
  })

  it("guarda un perfil válido", async () => {
    const profile = {
      id: "1be39b3c-7141-4b06-9c15-5f8e7b4520c4",
      agencyId,
      brandName: "Viajes Centro",
      data: createEmptyBrandProfileData(),
      schemaVersion: 1,
      completion: { percentage: 10, missing: [] },
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    }
    jest.mocked(saveBrandProfile).mockResolvedValue(profile)

    const response = await PUT(
      new Request("http://localhost/api/growth-studio/brand-profile", {
        method: "PUT",
        body: JSON.stringify({
          agencyId,
          brandName: "Viajes Centro",
          data: createEmptyBrandProfileData(),
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.profile.brandName).toBe("Viajes Centro")
  })
})
