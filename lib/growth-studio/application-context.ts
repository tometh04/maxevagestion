import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { GrowthStudioAccessResult } from "@/lib/growth-studio/access"
import { canAccessGrowthStudioAgency } from "@/lib/growth-studio/access-rules"

export interface GrowthStudioApplicationContext {
  supabase: SupabaseClient<Database>
  userId: string
  orgId: string
  access: Extract<GrowthStudioAccessResult, { allowed: true }>
}

export function hasAgencyAccess(
  context: GrowthStudioApplicationContext,
  agencyId: string
): boolean {
  return (
    context.access.organization.id === context.orgId &&
    canAccessGrowthStudioAgency(context.access, agencyId)
  )
}

