import { getCurrentUser } from "@/lib/auth"
import { CerebroChat } from "@/components/tools/cerebro-chat"

export default async function CerebroPage() {
  const { user } = await getCurrentUser()

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <CerebroChat userId={user?.id || ""} userName={user?.name || "Usuario"} />
    </div>
  )
}
