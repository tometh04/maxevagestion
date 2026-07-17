import { NextResponse } from "next/server"
import { z } from "zod"
import {
  getCampaignDetails,
  selectCampaignConcept,
} from "@/lib/growth-studio/campaign-service"
import {
  getGrowthStudioApiContext,
  growthStudioApiError,
  parseJsonBody,
} from "@/app/api/growth-studio/_shared"

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({ agencyId: z.string().uuid() })
const selectionSchema = z.object({
  agencyId: z.string().uuid(),
  conceptIndex: z.number().int().min(1).max(3),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params)
    const query = querySchema.parse({
      agencyId: new URL(request.url).searchParams.get("agencyId"),
    })
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const campaign = await getCampaignDetails(
      resolved.context,
      query.agencyId,
      id
    )
    return NextResponse.json({ data: { campaign } })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params)
    const payload = selectionSchema.parse(await parseJsonBody(request))
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const campaign = await selectCampaignConcept(resolved.context, {
      agencyId: payload.agencyId,
      campaignId: id,
      conceptIndex: payload.conceptIndex,
    })
    return NextResponse.json({ data: { campaign } })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

