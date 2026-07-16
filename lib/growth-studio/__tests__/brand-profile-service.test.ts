/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { createEmptyBrandProfileData } from "../brand-profile-schema"
import {
  getBrandProfile,
  GrowthStudioAgencyNotFoundError,
  saveBrandProfile,
} from "../brand-profile-service"

const row = {
  id: "1be39b3c-7141-4b06-9c15-5f8e7b4520c4",
  org_id: "b96794d8-160f-4126-a3b1-0062498d25cc",
  agency_id: "7e152aef-a90e-4b87-ac5f-b262d0eea4a9",
  brand_name: "Viajes Centro",
  profile_data: createEmptyBrandProfileData(),
  schema_version: 1,
  created_by: "598704c5-c253-481b-b93b-6d8cfc3f7728",
  updated_by: "598704c5-c253-481b-b93b-6d8cfc3f7728",
  created_at: "2026-07-16T00:00:00.000Z",
  updated_at: "2026-07-16T00:00:00.000Z",
}

const access = {
  allowed: true as const,
  organization: {
    id: row.org_id,
    plan: "ENTERPRISE",
    subscription_status: "ACTIVE",
    current_period_ends_at: null,
    trial_ends_at: null,
  },
  agencies: [{ id: row.agency_id, name: "Centro" }],
  agencyIds: [row.agency_id],
}

function makeContext(supabase: SupabaseClient<Database>) {
  return {
    supabase,
    userId: row.updated_by,
    orgId: row.org_id,
    access,
  }
}

describe("brand-profile-service", () => {
  it("rechaza una agencia fuera del scope antes de consultar Supabase", async () => {
    const from = jest.fn()
    const supabase = { from } as unknown as SupabaseClient<Database>

    await expect(
      getBrandProfile(makeContext(supabase), "efce55aa-d73d-4c55-b36a-797f579607df")
    ).rejects.toBeInstanceOf(GrowthStudioAgencyNotFoundError)
    expect(from).not.toHaveBeenCalled()
  })

  it("filtra la lectura por org_id y agency_id", async () => {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    const supabase = {
      from: jest.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>

    const result = await getBrandProfile(makeContext(supabase), row.agency_id)

    expect(query.eq).toHaveBeenNthCalledWith(1, "org_id", row.org_id)
    expect(query.eq).toHaveBeenNthCalledWith(2, "agency_id", row.agency_id)
    expect(result?.brandName).toBe("Viajes Centro")
  })

  it("upsertea con identidad tenant-agencia y auditoría del usuario", async () => {
    const query = {
      upsert: jest.fn(),
      select: jest.fn(),
      single: jest.fn().mockResolvedValue({ data: row, error: null }),
    }
    query.upsert.mockReturnValue(query)
    query.select.mockReturnValue(query)
    const supabase = {
      from: jest.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>

    await saveBrandProfile(makeContext(supabase), {
      agencyId: row.agency_id,
      brandName: row.brand_name,
      data: createEmptyBrandProfileData(),
    })

    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: row.org_id,
        agency_id: row.agency_id,
        created_by: row.updated_by,
        updated_by: row.updated_by,
      }),
      { onConflict: "org_id,agency_id" }
    )
  })
})
