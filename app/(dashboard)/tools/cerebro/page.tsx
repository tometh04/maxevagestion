import { getCurrentUser } from "@/lib/auth"
import { CerebroChat } from "@/components/tools/cerebro-chat"

export default async function CerebroPage() {
  const { user } = await getCurrentUser()

  return (
    <CerebroChat userId={user?.id || ""} userName={user?.name || "Usuario"} />
  )
}
