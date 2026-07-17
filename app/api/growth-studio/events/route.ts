import { NextResponse } from "next/server"
import { growthStudioEventSchema } from "@/lib/growth-studio/asset-schema"
import { recordGrowthStudioEvent } from "@/lib/growth-studio/asset-service"
import {
  getGrowthStudioApiContext,
  growthStudioApiError,
  parseJsonBody,
} from "@/app/api/growth-studio/_shared"

export async function POST(request: Request) {
  try {
    const payload = growthStudioEventSchema.parse(await parseJsonBody(request))
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    await recordGrowthStudioEvent(resolved.context, payload)
    return NextResponse.json({ data: { recorded: true } }, { status: 201 })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

