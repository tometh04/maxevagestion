import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { WhaControlPage } from "@/components/tools/wha-control/wha-control-page"

export default async function WhaControlPageRoute() {
  const { user } = await getCurrentUser()

  // Access control: only SUPER_ADMIN and ADMIN roles
  if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const { data: agencies } = await (supabase as any)
    .from("agencies")
    .select("id, name")
    .order("name")

  return (
    <div className="flex flex-1 flex-col">
      <WhaControlPage userId={user.id} userName={user.name} agencies={agencies || []} />
    </div>
  )
}
