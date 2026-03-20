import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { WhaControlPage } from "@/components/tools/wha-control/wha-control-page"

export default async function WhaControlPageRoute() {
  const { user } = await getCurrentUser()

  // Access control: only maxi@erplozada.com
  if (user.email !== "maxi@erplozada.com") {
    redirect("/dashboard")
  }

  return (
    <div className="flex flex-1 flex-col">
      <WhaControlPage userId={user.id} userName={user.name} />
    </div>
  )
}
