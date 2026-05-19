/**
 * Borra los leads que se crearon en burst hoy (>4 leads por hora) por el bug
 * de "auto_create_leads acepta conversaciones viejas".
 *
 * Preserva los leads "auténticos" del flujo nuevo del bot:
 *  - Tomas (test inicial)
 *  - Diego (cliente real opción 5)
 *  - Daniel (cliente real sin opción, atendido por Ibarra)
 *  - Marcela (cliente real sin opción)
 *
 * Borra el resto creado entre 11:00 y 15:00 de hoy.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRESERVE_PHONES = new Set([
  "+5492954602920", // Tomas (test)
  "+5492323534418", // Diego (opt 5)
  "+5492995189991", // Daniel
  "+5492616640330", // Marcela
])

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  // Leads creados hoy desde las 11:00 UTC
  const todayBurst = "2026-05-19T11:00:00Z"
  const { data: floodLeads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, created_at")
    .eq("org_id", orgId)
    .gte("created_at", todayBurst)
    .order("created_at", { ascending: true })

  if (!floodLeads || floodLeads.length === 0) {
    console.log("No hay leads en burst")
    return
  }
  console.log(`Encontrados ${floodLeads.length} leads creados después de ${todayBurst}`)

  const toDelete = (floodLeads as any[]).filter(
    (l) => !PRESERVE_PHONES.has(l.contact_phone)
  )
  const preserved = (floodLeads as any[]).filter((l) =>
    PRESERVE_PHONES.has(l.contact_phone)
  )

  console.log(`A borrar: ${toDelete.length}`)
  console.log(`A preservar: ${preserved.length}`)
  for (const p of preserved) {
    console.log(`  ✓ preservo: ${p.contact_name} (${p.contact_phone})`)
  }

  if (toDelete.length === 0) {
    console.log("Nada que borrar")
    return
  }

  const ids = toDelete.map((l) => l.id)

  // Borrar tag_assignments primero (FK)
  await admin.from("lead_tag_assignments").delete().in("lead_id", ids)
  console.log(`  ✓ tag_assignments borrados`)

  // Borrar leads
  const { error } = await admin.from("leads").delete().in("id", ids)
  if (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
  console.log(`✓ ${toDelete.length} leads borrados`)

  // Final count
  const { count } = await admin
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
  console.log(`\nLeads VICO restantes: ${count}`)
})()
