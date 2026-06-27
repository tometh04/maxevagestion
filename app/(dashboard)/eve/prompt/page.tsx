import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { createServerClient } from "@/lib/supabase/server"
import { PromptEditor } from "@/components/eve/prompt-editor"
import type { EveIntegrationConfig } from "@/lib/integrations/eve/types"

export const dynamic = "force-dynamic"

export default async function EvePromptPage() {
  const { user } = await getCurrentUser()

  // Guard de permiso
  if (!canPerformAction(user, "eve", "read")) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()

  // Cross-tenant fix: leer prompt del espejo local en config
  const { data: integ } = await (supabase
    .from("org_integrations") as any)
    .select("config")
    .eq("org_id", user.org_id)
    .eq("integration", "eve")
    .maybeSingle()

  const config = (integ?.config as EveIntegrationConfig | null) ?? {}
  const connected = !!config.eve_agencia_id
  const initialPrompt = config.prompt_custom ?? null

  return (
    <PromptEditor
      connected={connected}
      canWrite={canPerformAction(user, "eve", "write")}
      initialPrompt={initialPrompt}
    />
  )
}
