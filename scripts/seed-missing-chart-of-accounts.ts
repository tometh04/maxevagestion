/**
 * Siembra el plan de cuentas de las organizaciones que quedaron sin él (VIB-145).
 *
 * Contexto: el UNIQUE global sobre `chart_of_accounts.account_code` hacía que
 * `seedChartOfAccountsForOrg` reventara al primer código repetido, así que solo
 * la org template (Lozada Rosario) terminó con plan de cuentas. Consecuencia:
 * las demás agencias nunca generaron asientos de venta, costo ni comisión —
 * esas funciones devuelven null cuando no encuentran las cuentas.
 *
 * REQUIERE la migración 20260819000001 aplicada (índice por (org_id, account_code)).
 * Sin ella los inserts fallan por clave duplicada.
 *
 * Diferencia con `seedChartOfAccountsForOrg`: aquella función saltea la org si
 * ya tiene CUALQUIER cuenta. Acá se siembran las cuentas **faltantes por
 * código**, porque hay orgs con un par de cuentas sueltas de QA que no
 * constituyen un plan (ej. Compañía de Viajes con 9.9.97 y 9.9.98).
 *
 * Es idempotente: lo ya presente no se toca.
 *
 *   Dry-run (default):   npx tsx scripts/seed-missing-chart-of-accounts.ts
 *   Aplicar:             npx tsx scripts/seed-missing-chart-of-accounts.ts --apply
 *   Incluir inactivas:   ... --all
 *   Otra org template:   ... --template <slug>
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const ALL = args.includes("--all")
const templateSlug = args.includes("--template")
  ? args[args.indexOf("--template") + 1]
  : "lozada-viajes"

type TemplateAccount = {
  id: string
  account_code: string
  account_name: string
  category: string
  subcategory: string | null
  account_type: string | null
  level: number | null
  parent_id: string | null
  is_movement_account: boolean | null
  display_order: number | null
  description: string | null
}

async function main() {
  console.log("=".repeat(78))
  console.log(`SIEMBRA de plan de cuentas faltante — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  console.log(`Template: ${templateSlug}${ALL ? "  |  incluyendo orgs inactivas" : ""}`)
  console.log("=".repeat(78))

  // 1. Template
  const { data: templateOrg } = await admin
    .from("organizations")
    .select("id, name")
    .eq("slug", templateSlug)
    .maybeSingle()

  if (!templateOrg) {
    console.error(`Org template "${templateSlug}" no encontrada.`)
    process.exit(1)
  }

  const { data: templateAccounts } = await admin
    .from("chart_of_accounts")
    .select(
      "id, account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description"
    )
    .eq("org_id", (templateOrg as any).id)
    .eq("is_active", true)
    .order("level", { ascending: true })
    .order("account_code", { ascending: true })

  const template = (templateAccounts ?? []) as TemplateAccount[]
  if (template.length === 0) {
    console.error("El template no tiene cuentas activas.")
    process.exit(1)
  }
  console.log(`\nTemplate "${(templateOrg as any).name}": ${template.length} cuentas\n`)

  // 2. Organizaciones destino
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, subscription_status")
    .neq("id", (templateOrg as any).id)
    .order("name")

  const targets: Array<{ id: string; name: string; status: string; opCount: number }> = []
  for (const o of (orgs ?? []) as any[]) {
    const { count: opCount } = await admin
      .from("operations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", o.id)

    const active = o.subscription_status === "ACTIVE" || (opCount ?? 0) > 0
    if (ALL || active) {
      targets.push({ id: o.id, name: o.name, status: o.subscription_status, opCount: opCount ?? 0 })
    }
  }

  if (targets.length === 0) {
    console.log("No hay organizaciones destino.")
    return
  }

  // 3. Por cada org, calcular qué códigos faltan
  const oldIdToCode = new Map(template.map((t) => [t.id, t.account_code]))
  let totalPendientes = 0
  const plan: Array<{ org: (typeof targets)[0]; faltantes: TemplateAccount[]; presentes: number }> = []

  for (const org of targets) {
    const { data: existing } = await admin
      .from("chart_of_accounts")
      .select("account_code")
      .eq("org_id", org.id)

    const have = new Set((existing ?? []).map((r: any) => r.account_code))
    const faltantes = template.filter((t) => !have.has(t.account_code))
    plan.push({ org, faltantes, presentes: have.size })
    totalPendientes += faltantes.length
  }

  console.log("-".repeat(78))
  for (const { org, faltantes, presentes } of plan) {
    const marca = faltantes.length === 0 ? "OK  " : "FALTA"
    console.log(
      `  ${marca} ${org.name}  [${org.status}, ${org.opCount} ops]  ` +
        `tiene ${presentes}, faltan ${faltantes.length}`
    )
  }
  console.log("-".repeat(78))
  console.log(`Cuentas a crear en total: ${totalPendientes}`)

  if (totalPendientes === 0) {
    console.log("\nNada que sembrar.")
    return
  }

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.")
    console.log("-".repeat(78))
    return
  }

  // 4. Insertar respetando la jerarquía (padres primero: el template ya viene
  //    ordenado por level ASC) y resolviendo parent_id por código.
  console.log("\nInsertando...")
  for (const { org, faltantes } of plan) {
    if (faltantes.length === 0) continue

    // Códigos ya presentes en la org destino, para poder colgar de un padre
    // que ya existía.
    const { data: existingRows } = await admin
      .from("chart_of_accounts")
      .select("id, account_code")
      .eq("org_id", org.id)

    const newIdByCode = new Map<string, string>(
      (existingRows ?? []).map((r: any) => [r.account_code, r.id])
    )

    let creadas = 0
    const errores: string[] = []

    for (const tpl of faltantes) {
      let parentId: string | null = null
      if (tpl.parent_id) {
        const parentCode = oldIdToCode.get(tpl.parent_id)
        if (parentCode) parentId = newIdByCode.get(parentCode) ?? null
      }

      const { data: inserted, error } = await admin
        .from("chart_of_accounts")
        .insert({
          org_id: org.id, // explícito: con service role no hay auth.uid()
          account_code: tpl.account_code,
          account_name: tpl.account_name,
          category: tpl.category,
          subcategory: tpl.subcategory,
          account_type: tpl.account_type,
          level: tpl.level,
          parent_id: parentId,
          is_movement_account: tpl.is_movement_account,
          is_active: true,
          display_order: tpl.display_order,
          description: tpl.description,
        } as any)
        .select("id")
        .single()

      if (error || !inserted) {
        errores.push(`${tpl.account_code}: ${error?.message ?? "sin id"}`)
        continue
      }
      newIdByCode.set(tpl.account_code, (inserted as any).id)
      creadas++
    }

    console.log(`  ${org.name}: ${creadas} creadas${errores.length ? `, ${errores.length} con error` : ""}`)
    for (const e of errores.slice(0, 5)) console.log(`      ${e}`)
    if (errores.some((e) => /duplicate key|unique/i.test(e))) {
      console.log("      ⚠️  Clave duplicada: falta aplicar la migración 20260819000001.")
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
