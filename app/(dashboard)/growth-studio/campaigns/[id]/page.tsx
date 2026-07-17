import { GrowthCampaignDetail } from "@/components/growth-studio/growth-campaign-detail"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <GrowthCampaignDetail campaignId={id} />
}

