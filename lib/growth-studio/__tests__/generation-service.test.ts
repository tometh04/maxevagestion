/** @jest-environment node */

jest.mock("@/lib/growth-studio/campaign-service", () => ({
  getCampaignDetails: jest.fn(),
  getLatestCampaignRevision: jest.fn(),
  appendCampaignRevision: jest.fn(),
}))

jest.mock("@/lib/growth-studio/brand-profile-service", () => ({
  getBrandProfile: jest.fn(),
}))

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { GrowthStudioAiProvider } from "@/lib/growth-studio/ai-provider"
import { getBrandProfile } from "@/lib/growth-studio/brand-profile-service"
import {
  appendCampaignRevision,
  getCampaignDetails,
} from "@/lib/growth-studio/campaign-service"
import {
  generateCampaignConcepts,
  GrowthStudioQuotaExceededError,
} from "@/lib/growth-studio/generation-service"

const orgId = "11111111-1111-4111-8111-111111111111"
const agencyId = "22222222-2222-4222-8222-222222222222"
const campaignId = "33333333-3333-4333-8333-333333333333"
const userId = "44444444-4444-4444-8444-444444444444"
const requestId = "55555555-5555-4555-8555-555555555555"

const concepts = {
  variants: [1, 2, 3].map((index) => ({
    index: index as 1 | 2 | 3,
    title: `Concepto ${index}`,
    angle: `Ángulo ${index}`,
    hook: `Gancho ${index}`,
    coreMessage: `Mensaje ${index}`,
    visualDirection: `Visual ${index}`,
    recommendedCta: "Consultanos",
  })),
}

function makeThenableUpdate() {
  const query = {
    update: jest.fn(),
    eq: jest.fn(),
    then: (resolve: (value: { error: null }) => unknown) =>
      Promise.resolve({ error: null }).then(resolve),
  }
  query.update.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function makeContext(options?: { quotaError?: string }) {
  const updates = makeThenableUpdate()
  const events = { insert: jest.fn().mockResolvedValue({ error: null }) }
  const supabase = {
    rpc: jest.fn().mockResolvedValue(
      options?.quotaError
        ? { data: null, error: { message: options.quotaError } }
        : {
            data: [
              { request_id: requestId, remaining: 19, is_existing: false },
            ],
            error: null,
          }
    ),
    from: jest.fn((table: string) =>
      table === "growth_studio_events" ? events : updates
    ),
  } as unknown as SupabaseClient<Database>

  return {
    context: {
      supabase,
      orgId,
      userId,
      access: {
        allowed: true as const,
        organization: {
          id: orgId,
          subscription_status: "ACTIVE",
          current_period_ends_at: null,
          trial_ends_at: null,
        },
        agencies: [{ id: agencyId, name: "Agencia Centro" }],
        agencyIds: [agencyId],
      },
    },
    supabase,
    updates,
  }
}

const provider: GrowthStudioAiProvider = {
  textModel: "test-text-model",
  imageModel: "test-image-model",
  generateConcepts: jest.fn().mockResolvedValue({ output: concepts, usage: null }),
  generateChannels: jest.fn(),
  generateImage: jest.fn(),
}

describe("Growth Studio generation service", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCampaignDetails as jest.Mock).mockResolvedValue({
      id: campaignId,
      agencyId,
      name: "Caribe",
      status: "DRAFT",
      brief: {
        agencyId,
        name: "Caribe",
        objective: "Conseguir nuevas consultas",
        contentType: "promotion",
        source: { type: "manual", id: null },
        channels: ["instagram_feed"],
        story: { mode: "single", screenCount: 1 },
        destinations: ["Punta Cana"],
        travelStart: null,
        travelEnd: null,
        offerDetails: "",
        includePrice: false,
        freeformNotes: "",
      },
      sourceType: "manual",
      sourceId: null,
      sourceSnapshot: null,
      selectedConceptIndex: null,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      revisions: [],
    })
    ;(getBrandProfile as jest.Mock).mockResolvedValue(null)
    ;(appendCampaignRevision as jest.Mock).mockResolvedValue({
      id: "revision-1",
      kind: "concepts",
      version: 1,
      payload: concepts,
      generationRequestId: requestId,
      createdAt: "2026-07-16T00:00:00.000Z",
    })
  })

  it("reserves quota, generates three concepts and persists the revision", async () => {
    const { context, supabase, updates } = makeContext()

    const result = await generateCampaignConcepts(
      context,
      { agencyId, campaignId, idempotencyKey: "idem-1" },
      provider
    )

    expect(supabase.rpc).toHaveBeenCalledWith(
      "reserve_growth_studio_generation",
      expect.objectContaining({
        p_org_id: orgId,
        p_agency_id: agencyId,
        p_kind: "concepts",
      })
    )
    expect(supabase.rpc).toHaveBeenCalledWith(
      "finish_growth_studio_generation",
      expect.objectContaining({
        p_org_id: orgId,
        p_agency_id: agencyId,
        p_status: "completed",
      })
    )
    expect(provider.generateConcepts).toHaveBeenCalledTimes(1)
    expect(appendCampaignRevision).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        campaignId,
        generationRequestId: requestId,
        kind: "concepts",
      })
    )
    expect(result.output.variants).toHaveLength(3)
    expect(result.remaining).toBe(19)
    expect(updates.update).toHaveBeenCalledWith({
      status: "CONCEPTS_READY",
      selected_concept_index: null,
    })
  })

  it("does not call the provider when the rolling quota is exhausted", async () => {
    const { context } = makeContext({
      quotaError: "growth_studio_quota_exceeded",
    })

    await expect(
      generateCampaignConcepts(
        context,
        { agencyId, campaignId, idempotencyKey: "idem-2" },
        provider
      )
    ).rejects.toBeInstanceOf(GrowthStudioQuotaExceededError)
    expect(provider.generateConcepts).not.toHaveBeenCalled()
  })
})
