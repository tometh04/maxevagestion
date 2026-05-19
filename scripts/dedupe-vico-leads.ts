/**
 * Cleanup de leads duplicados en VICO causados por bug en .maybeSingle()
 * cuando llegaban varios eventos rapid-fire para el mismo (org_id, contact_phone).
 *
 * Estrategia:
 *  1. Agrupa leads por contact_phone
 *  2. Para cada grupo con >1 fila: conserva el MÁS VIEJO (primer created_at)
 *  3. Migra tag_assignments + notes de los duplicados al lead canónico
 *  4. Borra los duplicados
 *
 * Idempotente: si no hay dupes, no toca nada. Safe to re-run.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  const { data: leads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, notes, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })

  if (!leads) {
    console.log("No hay leads")
    return
  }

  // Agrupar por contact_phone
  const groups: Record<string, any[]> = {}
  for (const l of leads as any[]) {
    if (!l.contact_phone) continue
    if (!groups[l.contact_phone]) groups[l.contact_phone] = []
    groups[l.contact_phone].push(l)
  }

  let totalMerged = 0
  let totalDeleted = 0
  for (const [phone, group] of Object.entries(groups)) {
    if (group.length <= 1) continue
    const canonical = group[0] // más viejo (orden asc)
    const dupes = group.slice(1)
    console.log(
      `\nPhone ${phone} | nombre=${canonical.contact_name} | canónico=${canonical.id.slice(0, 8)} | dupes=${dupes.length}`
    )

    const dupeIds = dupes.map((d) => d.id)

    // Migrar tag_assignments al canónico
    const { data: dupeTags } = await admin
      .from("lead_tag_assignments")
      .select("tag_id")
      .in("lead_id", dupeIds)
    const uniqueTagIds = Array.from(
      new Set((dupeTags ?? []).map((t: any) => t.tag_id))
    )
    if (uniqueTagIds.length > 0) {
      const rows = uniqueTagIds.map((tag_id) => ({
        lead_id: canonical.id,
        tag_id,
        org_id: orgId,
      }))
      await admin
        .from("lead_tag_assignments")
        .upsert(rows as never, { onConflict: "lead_id,tag_id" })
      console.log(`  ✓ Migrados ${uniqueTagIds.length} tags al canónico`)
    }

    // Borrar tag_assignments de los dupes (FK)
    await admin
      .from("lead_tag_assignments")
      .delete()
      .in("lead_id", dupeIds)

    // Mergear notes (append único — descarta exactos)
    const allNotes = [
      canonical.notes ?? "",
      ...dupes.map((d) => d.notes ?? ""),
    ]
      .filter(Boolean)
      .join("\n")
    if (allNotes && allNotes !== (canonical.notes ?? "")) {
      await admin
        .from("leads")
        .update({ notes: allNotes } as never)
        .eq("id", canonical.id)
      console.log(`  ✓ Mergeadas notes`)
    }

    // Borrar dupes
    const { error: delErr } = await admin
      .from("leads")
      .delete()
      .in("id", dupeIds)
    if (delErr) {
      console.error(`  ❌ Error borrando dupes:`, delErr)
      continue
    }
    console.log(`  ✓ ${dupes.length} dupe(s) borrado(s)`)

    totalMerged++
    totalDeleted += dupes.length
  }

  console.log(
    `\nResultado: ${totalMerged} grupos mergeados, ${totalDeleted} dupes borrados`
  )
})()
