/**
 * Consolida las cuentas financieras duplicadas de "Cuentas por Cobrar/Pagar"
 * (type ASSETS, chart 1.1.03 / 2.1.01) que se generaron por el bug de
 * find-or-create con .maybeSingle() en app/api/operations/route.ts.
 *
 * Para cada (org_id, chart_account_id, currency) con >1 cuenta activa:
 *   1. Canonical = la más antigua (created_at ASC).
 *   2. Re-apunta ledger_movements de las duplicadas → canonical.
 *   3. Marca is_active=false en las duplicadas (no se borran por seguridad/historial).
 *
 * Por defecto corre en DRY RUN. Para aplicar:  APPLY=1 npx tsx scripts/fix-cpc-cpp-duplicate-accounts.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APPLY = process.env.APPLY === "1"

;(async () => {
  console.log(APPLY ? "🔴 APPLY MODE — se modificará la base" : "🟡 DRY RUN — no se modifica nada\n")

  const { data: charts } = await admin
    .from("chart_of_accounts")
    .select("id, account_code")
    .in("account_code", ["1.1.03", "2.1.01"])
  const chartIds = (charts || []).map((c: any) => c.id)

  const { data: accounts } = await admin
    .from("financial_accounts")
    .select("id, name, currency, org_id, chart_account_id, is_active, created_at")
    .in("chart_account_id", chartIds)
    .eq("is_active", true)

  const groups = new Map<string, any[]>()
  for (const a of accounts || []) {
    const key = `${a.org_id}|${a.chart_account_id}|${a.currency}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  let totalDeactivated = 0
  let totalMoved = 0

  for (const [key, accs] of groups) {
    if (accs.length <= 1) continue
    const sorted = accs.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    const canonical = sorted[0]
    const dups = sorted.slice(1)
    const dupIds = dups.map((d) => d.id)
    const code = (charts || []).find((c: any) => c.id === canonical.chart_account_id)?.account_code

    console.log(`\n[${code} ${canonical.currency}] org=${canonical.org_id.slice(0, 8)} — ${accs.length} cuentas`)
    console.log(`  Canonical: ${canonical.id} "${canonical.name}" (${canonical.created_at?.slice(0, 10)})`)
    console.log(`  Duplicadas a consolidar: ${dups.length}`)

    // Contar ledger_movements a mover
    const { count: lmCount } = await admin
      .from("ledger_movements")
      .select("id", { count: "exact", head: true })
      .in("account_id", dupIds)
    console.log(`  ledger_movements a re-apuntar: ${lmCount}`)

    if (APPLY) {
      // Re-apuntar en lotes (IN admite muchos pero hacemos por dup para no exceder límites)
      for (const dupId of dupIds) {
        const { error: upErr } = await admin
          .from("ledger_movements")
          .update({ account_id: canonical.id })
          .eq("account_id", dupId)
        if (upErr) { console.error(`  ❌ error moviendo movements de ${dupId}:`, upErr.message); continue }
      }
      // Desactivar duplicadas
      const { error: deErr } = await admin
        .from("financial_accounts")
        .update({ is_active: false })
        .in("id", dupIds)
      if (deErr) { console.error(`  ❌ error desactivando duplicadas:`, deErr.message) }
      else console.log(`  ✅ ${dupIds.length} duplicadas desactivadas, ${lmCount} movements re-apuntados`)
    }

    totalDeactivated += dups.length
    totalMoved += lmCount || 0
  }

  console.log(`\n=== RESUMEN ===`)
  console.log(`Cuentas a desactivar: ${totalDeactivated}`)
  console.log(`ledger_movements a re-apuntar: ${totalMoved}`)
  console.log(APPLY ? "✅ Aplicado." : "🟡 Dry run — corré con APPLY=1 para aplicar.")
  process.exit(0)
})()
