/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  createCampaign,
  GrowthStudioCampaignNotFoundError,
  listCampaigns,
} from "@/lib/growth-studio/campaign-service"

const orgId = "11111111-1111-4111-8111-111111111111"
const agencyId = "22222222-2222-4222-8222-222222222222"
const userId = "33333333-3333-4333-8333-333333333333"

const access = {
  allowed: true as const,
  organization: {
    id: orgId,
    subscription_status: "ACTIVE",
    current_period_ends_at: null,
    trial_ends_at: null,
  },
  agencies: [{ id: agencyId, name: "Centro" }],
  agencyIds: [agencyId],
}

const brief = {
  agencyId,
  name: "Caribe",
  objective: "Conseguir nuevas consultas",
  contentType: "promotion" as const,
  source: { type: "manual" as const, id: null },
  channels: ["instagram_feed" as const, "whatsapp" as const],
  story: { mode: "single" as const, screenCount: 1 as const },
  destinations: ["Punta Cana"],
  travelStart: null,
  travelEnd: null,
  offerDetails: "",
  includePrice: false,
  freeformNotes: "",
}

function context(supabase: SupabaseClient<Database>) {
  return { supabase, orgId, userId, access }
}

describe("Growth Studio campaign service", () => {
  it("rejects an agency outside the resolved scope before querying", async () => {
    const from = jest.fn()
    const supabase = { from } as unknown as SupabaseClient<Database>

    await expect(
      createCampaign(context(supabase), {
        ...brief,
        agencyId: "44444444-4444-4444-8444-444444444444",
      })
    ).rejects.toBeInstanceOf(GrowthStudioCampaignNotFoundError)
    expect(from).not.toHaveBeenCalled()
  })

  it("creates a manual campaign with server-owned tenant and audit fields", async () => {
    const row = {
      id: "55555555-5555-4555-8555-555555555555",
      org_id: orgId,
      agency_id: agencyId,
      name: brief.name,
      status: "DRAFT",
      brief_data: brief,
      source_type: "manual",
      source_id: null,
      source_snapshot: null,
      selected_concept_index: null,
      created_by: userId,
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    }
    const query = {
      insert: jest.fn(),
      select: jest.fn(),
      single: jest.fn().mockResolvedValue({ data: row, error: null }),
    }
    query.insert.mockReturnValue(query)
    query.select.mockReturnValue(query)
    const supabase = {
      from: jest.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>

    const result = await createCampaign(context(supabase), brief)

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: orgId,
        agency_id: agencyId,
        created_by: userId,
        source_type: "manual",
        source_id: null,
        source_snapshot: null,
      })
    )
    expect(result.id).toBe(row.id)
  })

  it("lists campaigns with explicit org and agency filters", async () => {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    const supabase = {
      from: jest.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>

    await listCampaigns(context(supabase), agencyId)

    expect(query.eq).toHaveBeenNthCalledWith(1, "org_id", orgId)
    expect(query.eq).toHaveBeenNthCalledWith(2, "agency_id", agencyId)
  })
})
