/**
 * Siembra el plan de cuentas en las agencias que quedaron sin él.
 *
 * POR QUÉ HAY AGENCIAS SIN PLAN
 * -----------------------------
 * `seedChartOfAccountsForOrg` se llamaba SOLO desde el alta por platform admin
 * (`app/api/admin/orgs/route.ts`), y encima detrás de un flag opcional. El
 * onboarding —por donde entran los clientes que se registran solos— creaba la
 * organización y nunca lo llamaba. Las 8 agencias creadas entre el 11 y el 21 de
 * agosto de 2026 quedaron con el plan vacío.
 *
 * La cadena se cortaba en silencio: sin plan, al crear su primera caja o banco
 * el alta busca la cuenta contable que corresponde al tipo, no encuentra nada, y
 * la cuenta financiera queda sin vincular. Sin esa vinculación el motor saltea
 * todos sus movimientos y la agencia nunca genera un asiento.
 *
 * El agujero de origen ya está tapado en `app/api/onboarding/route.ts`. Esto
 * cubre a las que entraron antes.
 *
 * POR QUÉ ES SEGURO
 * -----------------
 * Es aditivo puro: crea filas en `chart_of_accounts`. No toca saldos, ni
 * movimientos, ni cuentas financieras, ni ninguna pantalla. Estas agencias hoy
 * no tienen NADA apoyado en el plan, justamente porque no lo tienen.
 *
 * Ojo con lo que NO hace: no vincula las cuentas financieras que ya existen.
 * Eso cambiaría la categoría de la cuenta y con ella el signo de su saldo
 * (`isDebitNaturalAccount`), así que es una decisión aparte. Las cuentas que se
 * creen de acá en adelante sí se vinculan solas.
 *
 *   Dry-run (default):  npx tsx scripts/seed-chart-for-orgs-without-one.ts
 *   Aplicar:            npx tsx scripts/seed-chart-for-orgs-without-one.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APPLY = process.argv.includes("--apply")

async function main() {
  console.log("=".repeat(78))
  console.log(`SIEMBRA de plan de cuentas — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  console.log("=".repeat(78))

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, created_at")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error leyendo organizaciones:", error.message)
    process.exit(1)
  }

  const sinPlan: any[] = []
  for (const org of (orgs ?? []) as any[]) {
    const { count } = await admin
      .from("chart_of_accounts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
    if ((count ?? 0) === 0) sinPlan.push(org)
  }

  console.log(`\nOrganizaciones: ${orgs?.length ?? 0}`)
  console.log(`Sin plan de cuentas: ${sinPlan.length}`)
  for (const o of sinPlan) {
    console.log(`  ${String(o.created_at).slice(0, 10)}  ${o.name}`)
  }

  if (sinPlan.length === 0) {
    console.log("\nNada que hacer.")
    return
  }

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.")
    console.log("-".repeat(78))
    return
  }

  const { seedChartOfAccountsForOrg } = await import("../lib/accounting/seed-chart-of-accounts")

  let ok = 0
  const errores: string[] = []
  for (const org of sinPlan) {
    try {
      const r = await seedChartOfAccountsForOrg(org.id, admin as any)
      console.log(`  ${org.name}: ${r.created} creadas, ${r.skipped} salteadas`)
      ok++
    } catch (e: any) {
      errores.push(`${org.name}: ${e.message}`)
    }
  }

  console.log("\n" + "-".repeat(78))
  console.log(`Agencias sembradas: ${ok}`)
  if (errores.length) {
    console.log(`Errores: ${errores.length}`)
    for (const e of errores) console.log(`  ${e}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
