import { NextResponse } from "next/server"
import { z } from "zod"
import { listCommercialSources } from "@/lib/growth-studio/source-service"
import {
  getGrowthStudioApiContext,
  growthStudioApiError,
} from "@/app/api/growth-studio/_shared"

const querySchema = z.object({ agencyId: z.string().uuid() })

export async function GET(request: Request) {
  try {
    const query = querySchema.parse({
      agencyId: new URL(request.url).searchParams.get("agencyId"),
    })
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const sources = await listCommercialSources(
      resolved.context,
      query.agencyId
    )
    return NextResponse.json({ data: { sources } })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

