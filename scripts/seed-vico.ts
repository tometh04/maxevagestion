/**
 * scripts/seed-vico.ts
 *
 * One-off script para activar VICO Travel Group en crm_mode='advanced'.
 *
 * Uso:
 *   VICO_ORG_ID=<uuid> npx tsx scripts/seed-vico.ts
 *
 * Pre-requisitos:
 *   - Migration 01 (advanced_crm_mode) aplicada
 *   - Migration 02 (org_integrations) aplicada
 *   - La org de VICO existe en organizations
 *   - NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { seedAdvancedMode } from "../lib/crm-presets/seed-advanced-mode"
import {
  VICO_TAG_CATEGORIES,
  VICO_FUNNELS,
} from "../lib/crm-presets/vico-preset"
import type { Database } from "../lib/supabase/types"

loadEnv({ path: ".env.local" })

const orgId = process.env.VICO_ORG_ID
if (!orgId) {
  console.error("Error: VICO_ORG_ID env var requerida")
  console.error(
    "Uso: VICO_ORG_ID=<uuid> npx tsx scripts/seed-vico.ts"
  )
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(
    "Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridas en .env.local"
  )
  process.exit(1)
}

const admin: SupabaseClient<Database> = createClient<Database>(url, key)

async function fetchCounts(orgIdArg: string) {
  const [c, t, f, o] = await Promise.all([
    admin
      .from("lead_tag_categories")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgIdArg),
    admin
      .from("lead_tags")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgIdArg),
    admin
      .from("lead_funnels")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgIdArg),
    admin
      .from("organizations")
      .select("crm_mode, name")
      .eq("id", orgIdArg)
      .single(),
  ])
  const orgRow = o.data as { crm_mode: string; name: string } | null
  return {
    categories: c.count ?? 0,
    tags: t.count ?? 0,
    funnels: f.count ?? 0,
    crm_mode: orgRow?.crm_mode ?? "(unknown)",
    org_name: orgRow?.name ?? "(unknown)",
  }
}

async function main() {
  console.log(`📋 Verificando que la org ${orgId} exista...`)
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, crm_mode")
    .eq("id", orgId!)
    .maybeSingle()
  if (orgErr) {
    console.error("Error consultando organizations:", orgErr.message)
    process.exit(1)
  }
  if (!org) {
    console.error(
      `Error: org_id ${orgId} no existe en organizations. Creá la org via signup primero.`
    )
    process.exit(1)
  }
  const orgRow = org as { id: string; name: string; crm_mode: string }
  console.log(`   Org: "${orgRow.name}" (crm_mode actual: ${orgRow.crm_mode})`)

  console.log(`🌱 Aplicando seed (idempotente)...`)
  await seedAdvancedMode(admin, orgId!, {
    categories: VICO_TAG_CATEGORIES,
    funnels: VICO_FUNNELS,
  })

  console.log(`📊 Verificando counts...`)
  const counts = await fetchCounts(orgId!)
  console.log(`   ${JSON.stringify(counts, null, 2)}`)

  const expected = {
    categories: 4,
    tags: 60,
    funnels: 7,
    crm_mode: "advanced",
  }
  const mismatches: string[] = []
  if (counts.categories !== expected.categories)
    mismatches.push(
      `categories=${counts.categories} (expected ${expected.categories})`
    )
  if (counts.tags !== expected.tags)
    mismatches.push(`tags=${counts.tags} (expected ${expected.tags})`)
  if (counts.funnels !== expected.funnels)
    mismatches.push(`funnels=${counts.funnels} (expected ${expected.funnels})`)
  if (counts.crm_mode !== expected.crm_mode)
    mismatches.push(
      `crm_mode='${counts.crm_mode}' (expected '${expected.crm_mode}')`
    )

  if (mismatches.length > 0) {
    console.error(`❌ Counts no coinciden con lo esperado:`)
    for (const m of mismatches) console.error(`   - ${m}`)
    process.exit(1)
  }

  console.log(
    `✅ VICO seed complete. crm_mode='advanced'. Tags y funnels listos.`
  )
}

main().catch((e) => {
  console.error("Error en seed-vico:", e)
  process.exit(1)
})
