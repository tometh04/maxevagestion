import { NextResponse } from "next/server"
import { z } from "zod"
import type { Json } from "@/lib/supabase/types"
import {
  growthAssetQuerySchema,
  growthAssetUploadSourceSchema,
} from "@/lib/growth-studio/asset-schema"
import {
  listGrowthAssets,
  uploadGrowthAsset,
  GrowthStudioAssetValidationError,
} from "@/lib/growth-studio/asset-service"
import { compositionSchema } from "@/lib/growth-studio/composition-schema"
import {
  getGrowthStudioApiContext,
  growthStudioApiError,
} from "@/app/api/growth-studio/_shared"

const optionalUuid = z.union([z.string().uuid(), z.literal(""), z.null()])

export async function GET(request: Request) {
  try {
    const query = growthAssetQuerySchema.parse({
      agencyId: new URL(request.url).searchParams.get("agencyId"),
    })
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const library = await listGrowthAssets(resolved.context, query.agencyId)
    return NextResponse.json({ data: library })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response

    const formData = await request.formData()
    const agencyId = z.string().uuid().parse(formData.get("agencyId"))
    const source = growthAssetUploadSourceSchema.parse(formData.get("source"))
    const campaignValue = optionalUuid.parse(formData.get("campaignId"))
    const campaignId = campaignValue || null
    const file = formData.get("file")
    if (!(file instanceof File)) {
      throw new GrowthStudioAssetValidationError("Seleccioná una imagen")
    }

    let metadata: Json = {}
    const metadataRaw = formData.get("metadata")
    if (typeof metadataRaw === "string" && metadataRaw.trim()) {
      let parsed: unknown
      try {
        parsed = JSON.parse(metadataRaw)
      } catch {
        throw new GrowthStudioAssetValidationError(
          "La composición no tiene un formato válido"
        )
      }
      metadata =
        source === "composition"
          ? (compositionSchema.parse(parsed) as unknown as Json)
          : (z.record(z.unknown()).parse(parsed) as unknown as Json)
    }

    const asset = await uploadGrowthAsset(resolved.context, {
      agencyId,
      campaignId,
      source,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      originalFileName: file.name,
      metadata,
    })
    return NextResponse.json({ data: { asset } }, { status: 201 })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

