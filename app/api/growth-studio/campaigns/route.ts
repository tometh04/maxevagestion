import { NextResponse } from "next/server"
import { z } from "zod"
import { campaignBriefSchema } from "@/lib/growth-studio/campaign-schema"
import {
  createCampaign,
  listCampaigns,
} from "@/lib/growth-studio/campaign-service"
import {
  getGrowthStudioApiContext,
  growthStudioApiError,
  parseJsonBody,
} from "@/app/api/growth-studio/_shared"

const querySchema = z.object({ agencyId: z.string().uuid() })

export async function GET(request: Request) {
  try {
    const query = querySchema.parse({
      agencyId: new URL(request.url).searchParams.get("agencyId"),
    })
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const campaigns = await listCampaigns(resolved.context, query.agencyId)
    return NextResponse.json({ data: { campaigns } })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const payload = campaignBriefSchema.parse(await parseJsonBody(request))
    const resolved = await getGrowthStudioApiContext()
    if (resolved.response) return resolved.response
    const campaign = await createCampaign(resolved.context, payload)
    return NextResponse.json({ data: { campaign } }, { status: 201 })
  } catch (error) {
    return growthStudioApiError(error)
  }
}

