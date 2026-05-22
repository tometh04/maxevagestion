/**
 * Snapshot completo de los leads VICO con tag_assignments + funnel.
 * Para verificar después del backfill que el mapping opción 1-5 quedó OK.
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
    .select(`
      id, contact_name, contact_phone, destination, quoted_price, created_at,
      funnel:funnel_id(name),
      tag_assignments:lead_tag_assignments(tag:tag_id(label, category:category_id(name)))
    `)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })

  for (const l of (leads ?? []) as any[]) {
    const funnelName = l.funnel?.name ?? "-"
    const tagsByCat: Record<string, string[]> = {}
    for (const ta of l.tag_assignments ?? []) {
      const catName = ta.tag?.category?.name ?? "?"
      if (!tagsByCat[catName]) tagsByCat[catName] = []
      tagsByCat[catName].push(ta.tag.label)
    }
    const tagsStr = Object.entries(tagsByCat)
      .map(([cat, labels]) => `${cat}=[${labels.join(",")}]`)
      .join(" ")
    console.log(
      `${l.id.slice(0, 8)} | ${l.contact_name} (${l.contact_phone}) | ${l.created_at.slice(0, 19)} | funnel=${funnelName} | dest=${l.destination} | $${l.quoted_price ?? "-"} | ${tagsStr || "(sin tags)"}`
    )
  }
  console.log(`\nTotal: ${leads?.length ?? 0} leads`)
})()
