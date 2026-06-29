/**
 * Diagnóstico comisión OP-...F790FA44 (Milla Cero / Punta Cana).
 * Run: npx tsx scripts/diag-commission-f790fa44.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data: ops } = await admin
    .from("operations")
    .select("*")
    .ilike("file_code", "%F790FA44%")

  if (!ops || ops.length === 0) {
    console.error("No se encontró la operación F790FA44")
    return
  }

  for (const op of ops as any[]) {
    console.log(`\n========== ${op.file_code} (${op.id}) ==========`)
    // Volcar todas las columnas que contengan 'seller' o 'commission'
    const sellerCommissionKeys = Object.keys(op).filter(
      (k) => k.includes("seller") || k.includes("commission")
    )
    console.log("-- columnas seller/commission --")
    for (const k of sellerCommissionKeys) {
      console.log(`  ${k} =`, op[k])
    }
    console.log("sale_amount_total :", op.sale_amount_total)
    console.log("operator_cost     :", op.operator_cost)
    console.log("margin_amount     :", op.margin_amount)
    console.log("status            :", op.status)

    const sellerIds = sellerCommissionKeys
      .filter((k) => k.includes("seller"))
      .map((k) => op[k])
      .filter((v) => typeof v === "string" && v.length > 20)
    const uniq = Array.from(new Set(sellerIds))
    const { data: users } = await admin
      .from("users")
      .select("id, full_name, default_commission_percentage")
      .in("id", uniq.length ? uniq : ["00000000-0000-0000-0000-000000000000"])
    console.log("\n-- usuarios referenciados --")
    console.table(
      (users || []).map((u: any) => ({
        id: u.id?.slice(0, 8),
        full_name: u.full_name,
        default_pct: u.default_commission_percentage,
      }))
    )

    const { data: crs } = await admin
      .from("commission_records")
      .select("*")
      .eq("operation_id", op.id)
    const byId = new Map((users || []).map((u: any) => [u.id, u.full_name]))
    console.log("\n-- commission_records --")
    console.table(
      (crs || []).map((c: any) => ({
        seller: byId.get(c.seller_id) || c.seller_id?.slice(0, 8),
        amount: c.amount,
        percentage: c.percentage,
        status: c.status,
        date_calculated: c.date_calculated,
      }))
    )
  }
})()
