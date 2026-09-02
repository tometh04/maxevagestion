import { assertAddonEnabledPage } from "@/lib/addons/guard"
import { getCurrentUser } from "@/lib/auth"
import { CerebroChat } from "@/components/tools/cerebro-chat"
import { createServerClient } from "@/lib/supabase/server"

export default async function CerebroPage() {
  const { user } = await getCurrentUser()

  // Complemento contratado. El endpoint /api/ai lo valida por su cuenta:
  // esconder la pantalla no es autorización.
  const supabase = await createServerClient()
  await assertAddonEnabledPage(supabase, (user as any)?.org_id ?? null, "cerebro")

  return (
    <CerebroChat userId={user?.id || ""} userName={user?.name || "Usuario"} />
  )
}
