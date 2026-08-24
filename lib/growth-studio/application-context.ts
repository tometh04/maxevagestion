import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { GrowthStudioAccessResult } from "@/lib/growth-studio/access"
import { canAccessGrowthStudioAgency } from "@/lib/growth-studio/access-rules"
import type { AgencyPermissionScope } from "@/lib/permissions/agency-scope-server"

export interface GrowthStudioApplicationContext {
  supabase: SupabaseClient<Database>
  userId: string
  orgId: string
  access: Extract<GrowthStudioAccessResult, { allowed: true }>
  /** Scopes per-agency; CRM nunca debe ampliar el acceso a operaciones. */
  quotationSourceScope?: AgencyPermissionScope
  operationSourceScope?: AgencyPermissionScope
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
