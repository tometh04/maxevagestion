import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { WhaControlPage } from "@/components/tools/wha-control/wha-control-page"

export default async function WhaControlPageRoute() {
  const { user } = await getCurrentUser()

  if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const agencies = await getScopedAgenciesForUser(supabase, user)

  return (
    <div className="flex flex-1 flex-col">
      <WhaControlPage userId={user.id} userName={user.name} agencies={agencies} />
    </div>
  )
}
