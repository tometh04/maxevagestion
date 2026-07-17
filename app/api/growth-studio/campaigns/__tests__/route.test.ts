/** @jest-environment node */

jest.mock("@/app/api/growth-studio/_shared", () => {
  const { NextResponse } = jest.requireActual("next/server")
  return {
    getGrowthStudioApiContext: jest.fn(),
    growthStudioApiError: jest.fn((error: unknown) => {
      const message = error instanceof Error ? error.message : "Error interno"
      return NextResponse.json({ error: message }, { status: 400 })
    }),
    parseJsonBody: jest.fn((request: Request) => request.json()),
  }
})
jest.mock("@/lib/growth-studio/campaign-service", () => ({
  createCampaign: jest.fn(),
  listCampaigns: jest.fn(),
}))

import { getGrowthStudioApiContext } from "@/app/api/growth-studio/_shared"
import {
  createCampaign,
  listCampaigns,
} from "@/lib/growth-studio/campaign-service"
import { GET, POST } from "../route"

const agencyId = "22222222-2222-4222-8222-222222222222"
const context = { orgId: "11111111-1111-4111-8111-111111111111" }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getGrowthStudioApiContext).mockResolvedValue({ context } as never)
})

describe("/api/growth-studio/campaigns", () => {
  it("rechaza un listado sin agencia", async () => {
    const response = await GET(
      new Request("http://localhost/api/growth-studio/campaigns")
    )

    expect(response.status).toBe(400)
    expect(listCampaigns).not.toHaveBeenCalled()
  })

  it("delega el listado con la agencia validada", async () => {
    jest.mocked(listCampaigns).mockResolvedValue([])

    const response = await GET(
      new Request(
        `http://localhost/api/growth-studio/campaigns?agencyId=${agencyId}`
      )
    )

    expect(response.status).toBe(200)
    expect(listCampaigns).toHaveBeenCalledWith(context, agencyId)
  })

  it("valida y crea una campaña con una agencia obligatoria", async () => {
    const input = {
      agencyId,
      name: "Caribe",
      objective: "Conseguir nuevas consultas",
      contentType: "promotion",
      source: { type: "manual", id: null },
      channels: ["instagram_feed", "whatsapp"],
      story: { mode: "single", screenCount: 1 },
      destinations: ["Punta Cana"],
      travelStart: null,
      travelEnd: null,
      offerDetails: "",
      includePrice: false,
      freeformNotes: "",
    }
    jest.mocked(createCampaign).mockResolvedValue({ id: "campaign-id" } as never)

    const response = await POST(
      new Request("http://localhost/api/growth-studio/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    )

    expect(response.status).toBe(201)
    expect(createCampaign).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ agencyId, channels: input.channels })
    )
  })
})
