/**
 * Backfill de regiones default del CRM para orgs que quedaron sin ninguna.
 *
 * Contexto: la migración 20260604000001_lead_regions_configurable seedeó las
 * 7 regiones default sólo para las orgs que existían al momento de correrla.
 * Las orgs creadas después arrancan con `lead_regions` vacío y no pueden crear
 * NINGÚN lead: `POST /api/leads` valida `region` contra esa tabla y devuelve
 * 400 "Región inválida para tu organización" para cualquier valor, mientras el
 * front muestra un fallback hardcodeado que hace parecer que el select anda.
 *
 * El fix permanente vive en `lib/leads/seed-lead-regions.ts` (llamado desde
 * `/api/onboarding` y `/api/admin/orgs`) más el trigger de la migración
 * 20260821000002. Este script es para destrabar las orgs ya afectadas.
 *
 * Uso:
 *   # Preview (NO escribe): lista las orgs sin regiones
 *   npx tsx scripts/backfill-lead-regions.ts
 *
 *   # Aplicar
 *   npx tsx scripts/backfill-lead-regions.ts --apply
 *
 * Flags:
 *   --org <id>   solo esa org
 *   --apply      escribe (sin esto es preview read-only)
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

import { seedLeadRegionsForOrg, DEFAULT_LEAD_REGIONS } from "../lib/leads/seed-lead-regions"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--apply")
  const orgFilter = args.includes("--org") ? args[args.indexOf("--org") + 1] : null

  let query = supabase
    .from("organizations")
    .select("id, name, subscription_status, created_at")
    .order("created_at", { ascending: true })
  if (orgFilter) query = query.eq("id", orgFilter)

  const { data: orgs, error } = await query
  if (error) throw new Error(`Error listando orgs: ${error.message}`)

  const affected: { id: string; name: string; status: string; created_at: string }[] = []
  for (const o of (orgs || []) as any[]) {
    const { count } = await supabase
      .from("lead_regions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", o.id)
    if (!count) {
      affected.push({
        id: o.id,
        name: o.name,
        status: o.subscription_status,
        created_at: o.created_at,
      })
    }
  }

  console.log(`\nOrgs sin lead_regions: ${affected.length} de ${(orgs || []).length}\n`)
  for (const o of affected) {
    console.log(`  ${o.name.padEnd(35)} ${String(o.status).padEnd(16)} alta ${o.created_at.slice(0, 10)}  ${o.id}`)
  }

  if (!affected.length) {
    console.log("\nNada que hacer.")
    return
  }

  if (!apply) {
    console.log(
      `\n[PREVIEW] Se insertarían ${DEFAULT_LEAD_REGIONS.length} regiones por org ` +
        `(${affected.length * DEFAULT_LEAD_REGIONS.length} filas). Correr con --apply para escribir.`
    )
    return
  }

  console.log("\nAplicando...\n")
  let created = 0
  const failed: string[] = []
  for (const o of affected) {
    try {
      const r = await seedLeadRegionsForOrg(o.id, supabase)
      created += r.created
      console.log(`  OK  ${o.name} → ${r.created} regiones`)
    } catch (e: any) {
      failed.push(`${o.name}: ${e?.message}`)
      console.error(`  ERR ${o.name}: ${e?.message}`)
    }
  }

  console.log(`\nListo. ${created} filas creadas en ${affected.length - failed.length} orgs.`)
  if (failed.length) {
    console.log(`Fallaron ${failed.length}:`)
    failed.forEach((f) => console.log(`  - ${f}`))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
