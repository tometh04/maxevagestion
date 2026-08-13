/**
 * Diagnóstico VIB-86: estado real de las comisiones de referido en producción.
 * Run: npx tsx "C:/Users/Mateo Montaña/.claude/jobs/51b6b9c1/tmp/diag-referrals.ts"
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data: orgs } = await admin.from("organizations").select("id, name")
  const orgName = new Map((orgs ?? []).map((o: any) => [o.id, o.name]))

  const { data: partners } = await admin
    .from("referral_partners")
    .select("id, org_id, name, default_commission_percentage, active")
  console.log(`\n=== referral_partners: ${partners?.length ?? 0} ===`)
  for (const p of partners ?? []) {
    console.log(
      `  ${orgName.get((p as any).org_id) ?? "?"} | ${(p as any).name} | ${(p as any).default_commission_percentage}% | activo=${(p as any).active}`
    )
  }

  const { data: coms } = await admin
    .from("referral_commissions")
    .select("id, org_id, status, amount, amount_paid, currency, date_paid, date_calculated, operation_id, referral_partner_id")
  console.log(`\n=== referral_commissions: ${coms?.length ?? 0} ===`)

  const agg = new Map<string, { n: number; amount: number; paid: number }>()
  for (const c of coms ?? []) {
    const k = `${orgName.get((c as any).org_id) ?? "?"} | ${(c as any).status} | ${(c as any).currency}`
    const a = agg.get(k) ?? { n: 0, amount: 0, paid: 0 }
    a.n++
    a.amount += Number((c as any).amount) || 0
    a.paid += Number((c as any).amount_paid) || 0
    agg.set(k, a)
  }
  for (const [k, v] of Array.from(agg.entries()).sort()) {
    console.log(`  ${k}: ${v.n} filas | comision=${v.amount.toFixed(2)} | liquidado=${v.paid.toFixed(2)}`)
  }

  // Monedas de las comisiones vs moneda de la venta
  const { data: comsOps } = await admin
    .from("referral_commissions")
    .select("id, currency, amount, status, operations:operation_id(file_code, sale_currency, sale_amount_total)")
  console.log(`\n=== detalle (currency comision vs sale_currency) ===`)
  for (const c of (comsOps ?? []) as any[]) {
    console.log(
      `  ${c.operations?.file_code ?? "?"} | com.currency=${c.currency} | sale_currency=${c.operations?.sale_currency} | monto=${c.amount} | ${c.status}`
    )
  }

  // ¿Hay algún ledger_movement que se le parezca (pago manual a referidor)?
  const { data: lm } = await admin
    .from("ledger_movements")
    .select("id, org_id, type, concept, amount_original, currency, created_at")
    .or("concept.ilike.%referid%,concept.ilike.%referral%")
    .limit(50)
  console.log(`\n=== ledger_movements con "referid/referral" en el concepto: ${lm?.length ?? 0} ===`)
  for (const m of (lm ?? []) as any[]) {
    console.log(`  ${orgName.get(m.org_id) ?? "?"} | ${m.type} | ${m.currency} ${m.amount_original} | ${m.concept} | ${m.created_at?.slice(0, 10)}`)
  }

  // Clientes marcados como referidos
  const { count } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .not("referral_partner_id", "is", null)
  console.log(`\n=== clientes marcados como referidos: ${count ?? 0} ===`)
})()
