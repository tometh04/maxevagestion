/**
 * scripts/enable-vico-auto-create-leads.ts
 *
 * Activa el flag `auto_create_leads` en la integración callbell-in de VICO,
 * de modo que cuando Callbell mande eventos de phones desconocidos, Vibook
 * cree automáticamente el lead. Este flag es OPT-IN por org — el resto de las
 * orgs (Lozada, etc.) sigue con el comportamiento legacy (solo update).
 *
 * Idempotente.
 *
 * Uso: npx tsx scripts/enable-vico-auto-create-leads.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // 1. Buscar org VICO
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", "vico-travel")
    .maybeSingle()
  if (!org) {
    console.error("❌ Org vico-travel NO EXISTE")
    process.exit(1)
  }
  const orgId = (org as any).id
  console.log(`✓ Org VICO: ${(org as any).name} (${orgId})`)

  // 2. Leer config actual de callbell-in
  const { data: integ } = await admin
    .from("org_integrations")
    .select("id, config")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .maybeSingle()
  if (!integ) {
    console.error(
      "❌ VICO no tiene integration='callbell-in' en org_integrations. Aborto."
    )
    process.exit(1)
  }
  const oldConfig = ((integ as any).config ?? {}) as Record<string, unknown>
  console.log(`Config actual: ${JSON.stringify(oldConfig)}`)

  if (oldConfig.auto_create_leads === true) {
    console.log("✓ auto_create_leads YA está activado. Nada que hacer.")
    return
  }

  // 3. Update config con flag = true
  const newConfig = { ...oldConfig, auto_create_leads: true }
  const { error: updErr } = await admin
    .from("org_integrations")
    .update({ config: newConfig } as never)
    .eq("id", (integ as any).id)
  if (updErr) {
    console.error("❌ Error actualizando config:", updErr)
    process.exit(1)
  }

  console.log(`✅ Config actualizado: ${JSON.stringify(newConfig)}`)
  console.log(`✅ VICO ahora crea leads automáticamente desde Callbell.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
