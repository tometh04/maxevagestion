/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  listGrowthAssets,
  uploadGrowthAsset,
} from "@/lib/growth-studio/asset-service"
import {
  GrowthStudioAssetNotFoundError,
  GrowthStudioAssetValidationError,
} from "@/lib/growth-studio/asset-errors"

const orgId = "11111111-1111-4111-8111-111111111111"
const agencyId = "22222222-2222-4222-8222-222222222222"
const userId = "33333333-3333-4333-8333-333333333333"

function context(supabase: SupabaseClient<Database>) {
  return {
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
      agencies: [{ id: agencyId, name: "Centro" }],
      agencyIds: [agencyId],
    },
  }
}

describe("Growth Studio asset service", () => {
  it("rechaza una agencia fuera del alcance antes de tocar storage", async () => {
    const from = jest.fn()
    const storage = { from: jest.fn() }
    const supabase = { from, storage } as unknown as SupabaseClient<Database>

    await expect(
      uploadGrowthAsset(context(supabase), {
        agencyId: "44444444-4444-4444-8444-444444444444",
        source: "upload",
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
      })
    ).rejects.toBeInstanceOf(GrowthStudioAssetNotFoundError)

    expect(from).not.toHaveBeenCalled()
    expect(storage.from).not.toHaveBeenCalled()
  })

  it("rechaza formatos no permitidos antes de subir el archivo", async () => {
    const storage = { from: jest.fn() }
    const supabase = { storage } as unknown as SupabaseClient<Database>

    await expect(
      uploadGrowthAsset(context(supabase), {
        agencyId,
        source: "upload",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/svg+xml",
      })
    ).rejects.toBeInstanceOf(GrowthStudioAssetValidationError)

    expect(storage.from).not.toHaveBeenCalled()
  })

  it("lista con filtros explícitos de organización y agencia", async () => {
    const assetsQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      is: jest.fn(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    }
    assetsQuery.select.mockReturnValue(assetsQuery)
    assetsQuery.eq.mockReturnValue(assetsQuery)
    assetsQuery.is.mockReturnValue(assetsQuery)

    const orgLogoQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    orgLogoQuery.select.mockReturnValue(orgLogoQuery)
    orgLogoQuery.eq.mockReturnValue(orgLogoQuery)

    const supabase = {
      from: jest.fn((table: string) =>
        table === "growth_assets" ? assetsQuery : orgLogoQuery
      ),
      storage: { from: jest.fn() },
    } as unknown as SupabaseClient<Database>

    const result = await listGrowthAssets(context(supabase), agencyId)

    expect(assetsQuery.eq).toHaveBeenNthCalledWith(1, "org_id", orgId)
    expect(assetsQuery.eq).toHaveBeenNthCalledWith(2, "agency_id", agencyId)
    expect(result).toEqual({ assets: [], logoUrl: null })
  })
})
