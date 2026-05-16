/**
 * scripts/get-vico-callbell-token.ts
 *
 * Devuelve el token COMPLETO del webhook callbell-in de VICO para configurar
 * en el dashboard de Callbell.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "vico-travel")
    .maybeSingle()
  if (!org) {
    console.error("No VICO org")
    process.exit(1)
  }
  const { data: integ } = await admin
    .from("org_integrations")
    .select("webhook_token, config, is_active")
    .eq("org_id", (org as any).id)
    .eq("integration", "callbell-in")
    .maybeSingle()
  if (!integ) {
    console.error("No callbell-in integration for VICO")
    process.exit(1)
  }
  const token = (integ as any).webhook_token as string
  const config = (integ as any).config
  console.log("WEBHOOK_URL=https://app.vibook.ai/api/integrations/callbell-in/" + token + "/webhook")
  console.log("CONFIG=" + JSON.stringify(config))
  console.log("ACTIVE=" + (integ as any).is_active)
}

main().catch((e) => { console.error(e); process.exit(1) })
