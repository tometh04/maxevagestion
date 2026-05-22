/**
 * scripts/check-vico-status.ts
 *
 * Verifica el estado de la org VICO + usuarios en prod.
 * Usage: npx tsx scripts/check-vico-status.ts
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
    .select("id, name, slug, crm_mode, plan, subscription_status, max_users")
    .eq("slug", "vico-travel")
    .maybeSingle()

  if (!org) {
    console.log("❌ Org 'vico-travel' NO EXISTE")
    return
  }

  console.log("✓ Org existe:", JSON.stringify(org, null, 2))

  const { data: users, count } = await admin
    .from("users")
    .select("id, email, name, role, is_active, auth_id", { count: "exact" })
    .eq("org_id", (org as any).id)
    .order("email")

  console.log(`\nUsers en la org: ${count}`)
  for (const u of ((users as any[]) ?? [])) {
    console.log(
      `  ${u.email} | role=${u.role} | active=${u.is_active} | auth=${u.auth_id?.slice(0, 8) ?? "NULL"}`
    )
  }

  const { data: agencies, count: agCount } = await admin
    .from("agencies")
    .select("id, name, city", { count: "exact" })
    .eq("org_id", (org as any).id)
  console.log(`\nAgencies: ${agCount}`)
  for (const a of ((agencies as any[]) ?? [])) console.log(`  ${a.name} (${a.city})`)

  // Tags + Funnels
  const [{ count: tagCount }, { count: funnelCount }, { count: catCount }] = await Promise.all([
    admin
      .from("lead_tags")
      .select("id", { count: "exact", head: true })
      .eq("org_id", (org as any).id),
    admin
      .from("lead_funnels")
      .select("id", { count: "exact", head: true })
      .eq("org_id", (org as any).id),
    admin
      .from("lead_tag_categories")
      .select("id", { count: "exact", head: true })
      .eq("org_id", (org as any).id),
  ])
  console.log(`\nTags: ${tagCount}, Funnels: ${funnelCount}, Categories: ${catCount}`)

  // Integrations
  const { data: integs } = await admin
    .from("org_integrations")
    .select("integration, is_active, webhook_token")
    .eq("org_id", (org as any).id)
  console.log(`\nIntegrations:`)
  for (const i of ((integs as any[]) ?? []))
    console.log(`  ${i.integration}: active=${i.is_active}, token=${i.webhook_token.slice(0, 12)}…`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
