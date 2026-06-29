/**
 * Audita operaciones donde seller_id == seller_secondary_id (mismo vendedor
 * como principal y secundario). Eso dispara el split 50/50 y reduce la
 * comisión a la mitad. Caso reportado: Milla Cero / Agostina Scolieri.
 * Run: npx tsx scripts/audit-duplicate-seller-commission.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  // Traer todas las ops con secondary seteado
  const { data: ops, error } = await admin
    .from("operations")
    .select(
      "id, file_code, org_id, seller_id, seller_secondary_id, commission_split, margin_amount, status"
    )
    .not("seller_secondary_id", "is", null)

  if (error) {
    console.error("Error:", error)
    return
  }

  const dupes = (ops || []).filter(
    (o: any) => o.seller_id && o.seller_secondary_id && o.seller_id === o.seller_secondary_id
  )

  console.log(`Total ops con secondary seller: ${ops?.length ?? 0}`)
  console.log(`Ops con seller_id == seller_secondary_id (BUG): ${dupes.length}`)

  // Agrupar por org
  const byOrg = new Map<string, number>()
  for (const o of dupes) byOrg.set(o.org_id, (byOrg.get(o.org_id) || 0) + 1)

  // Nombres de orgs
  const orgIds = Array.from(byOrg.keys())
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name")
    .in("id", orgIds.length ? orgIds : ["x"])
  const orgName = new Map((orgs || []).map((o: any) => [o.id, o.name]))

  console.log("\n-- Por organización --")
  console.table(
    Array.from(byOrg.entries()).map(([id, n]) => ({
      org: orgName.get(id) || id?.slice(0, 8),
      ops_afectadas: n,
    }))
  )

  console.log("\n-- Detalle (hasta 50) --")
  console.table(
    dupes.slice(0, 50).map((o: any) => ({
      file_code: o.file_code,
      org: orgName.get(o.org_id) || o.org_id?.slice(0, 8),
      margin: o.margin_amount,
      split: o.commission_split,
      status: o.status,
    }))
  )
})()
