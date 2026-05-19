/**
 * Borra leads creados a partir de eventos cuyo contact en Callbell ya tenía
 * assignedAgent != null (= ya estaba siendo atendido por un humano). Estos
 * son leads "falsos positivos" del flujo auto_create.
 *
 * Preserva los que SÍ son legítimos del bot:
 *  - Tomas (test, +5492954602920)
 *  - Diego (opción 5, +5492323534418)
 *  - Jorge (opción 4, +5493434059095)
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KEEP_PHONES = new Set([
  "+5492954602920", // Tomas
  "+5492323534418", // Diego (opt 5)
  "+5493434059095", // Jorge (opt 4 - Mundial)
])

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  const { data: leads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone")
    .eq("org_id", orgId)

  const toDelete = (leads ?? []).filter(
    (l: any) => !KEEP_PHONES.has(l.contact_phone)
  )
  console.log(`A borrar: ${toDelete.length}`)
  for (const l of toDelete as any[]) {
    console.log(`  - ${l.contact_name} (${l.contact_phone})`)
  }

  if (toDelete.length === 0) {
    console.log("Nada que borrar")
    return
  }

  const ids = toDelete.map((l: any) => l.id)
  await admin.from("lead_tag_assignments").delete().in("lead_id", ids)
  const { error } = await admin.from("leads").delete().in("id", ids)
  if (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }

  const { count } = await admin
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
  console.log(`\n✓ ${toDelete.length} borrados. Leads VICO restantes: ${count}`)
})()
