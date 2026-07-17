import { NextResponse } from "next/server"
import { z } from "zod"
import { createOpenAIGrowthStudioProvider } from "@/lib/growth-studio/ai-provider"
import { generateCampaignChannels } from "@/lib/growth-studio/generation-service"
import {
  getGrowthStudioApiContext,
  growthStudioApiError,
  parseJsonBody,
} from "@/app/api/growth-studio/_shared"

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  agencyId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params)
    const payload = bodySchema.parse(await parseJsonBody(request))
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const result = await generateCampaignChannels(
      resolved.context,
      {
        agencyId: payload.agencyId,
        campaignId: id,
        idempotencyKey: payload.idempotencyKey,
      },
      createOpenAIGrowthStudioProvider()
    )
    return NextResponse.json({ data: result })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

