/**
 * Borra el lead "Tomas" (+5492954602920) que creé manualmente via curl,
 * para que Tomi pueda mandar desde su celular real (mismo número) y se
 * genere un lead fresco del flujo Callbell → Vibook.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428" // VICO

  // 1. Buscar el lead Tomas por phone
  const { data: leads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, source, created_at")
    .eq("org_id", orgId)
    .eq("contact_phone", "+5492954602920")
  console.log("Leads encontrados:", leads)

  if (!leads || leads.length === 0) {
    console.log("✓ No hay lead con ese phone — nada que borrar")
    return
  }

  // 2. Borrar lead_tag_assignments primero (FK)
  const leadIds = (leads as any[]).map((l) => l.id)
  await admin.from("lead_tag_assignments").delete().in("lead_id", leadIds)

  // 3. Borrar webhook_event_log de Tomas (event uuids relacionados)
  // No es estrictamente necesario, pero limpia el rastro de test data.

  // 4. Borrar el lead
  const { error } = await admin.from("leads").delete().in("id", leadIds)
  if (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
  console.log(`✓ ${leadIds.length} lead(s) borrado(s)`)
})()
