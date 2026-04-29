import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { ImportV2Client } from "@/components/settings/import-v2-client"

export const dynamic = "force-dynamic"

export default async function ImportV2Page() {
  const { user } = await getCurrentUser()
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/")
  }

  const supabase = await createServerClient()
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

  const { data: agencies } = await (supabase.from("agencies") as any)
    .select("id, name")
    .in("id", agencyIds)
    .order("name")

  return (
    <ImportV2Client
      agencies={(agencies as Array<{ id: string; name: string }>) ?? []}
    />
  )
}
