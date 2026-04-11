import { SupabaseClient } from "@supabase/supabase-js"

interface MessageAccessUser {
  id: string
  role: string
}

interface MessageAccessRecord {
  agency_id?: string | null
  operation_id?: string | null
  recipient_user_id?: string | null
}

export async function getSellerOperationIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await (supabase.from("operations") as any)
    .select("id")
    .eq("seller_id", userId)

  return ((data || []) as Array<{ id?: string | null }>)
    .map((operation) => operation.id || "")
    .filter(Boolean)
}

export function buildSellerMessageScopeFilter(userId: string, operationIds: string[]): string {
  const filters = [`recipient_user_id.eq.${userId}`]

  if (operationIds.length > 0) {
    filters.push(`operation_id.in.(${operationIds.join(",")})`)
  }

  return filters.join(",")
}

export async function canUserAccessMessage(
  supabase: SupabaseClient,
  user: MessageAccessUser,
  message: MessageAccessRecord
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") {
    return true
  }

  if (user.role === "SELLER") {
    if (message.recipient_user_id === user.id) {
      return true
    }

    if (!message.operation_id) {
      return false
    }

    const { data: operation } = await (supabase.from("operations") as any)
      .select("id")
      .eq("id", message.operation_id)
      .eq("seller_id", user.id)
      .maybeSingle()

    return Boolean(operation)
  }

  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((agency: any) => agency.agency_id)
  return Boolean(message.agency_id && agencyIds.includes(message.agency_id))
}
