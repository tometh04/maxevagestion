import { NextResponse } from "next/server"
import { createOpenAIGrowthStudioProvider } from "@/lib/growth-studio/ai-provider"
import { growthAssetGenerationSchema } from "@/lib/growth-studio/asset-schema"
import { generateGrowthAsset } from "@/lib/growth-studio/asset-service"
import {
  getGrowthStudioApiContext,
  growthStudioApiError,
  parseJsonBody,
} from "@/app/api/growth-studio/_shared"

export async function POST(request: Request) {
  try {
    const payload = growthAssetGenerationSchema.parse(await parseJsonBody(request))
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const result = await generateGrowthAsset(
      resolved.context,
      payload,
      createOpenAIGrowthStudioProvider()
    )
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

