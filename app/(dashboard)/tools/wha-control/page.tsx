import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { WhaControlPage } from "@/components/tools/wha-control/wha-control-page"

export default async function WhaControlPageRoute() {
  const { user } = await getCurrentUser()

  // Access control: only maxi@erplozada.com
  if (user.email !== "maxi@erplozada.com") {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const { data: agencies } = await (supabase as any)
    .from("agencies")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  return (
    <div className="flex flex-1 flex-col">
      <WhaControlPage userId={user.id} userName={user.name} agencies={agencies || []} />
    </div>
  )
}
