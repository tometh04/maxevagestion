/**
 * =============================================================================
 * SCRIPT: fix-orphan-operators.ts
 * =============================================================================
 *
 * PROBLEMA
 * --------
 * El import de operaciones de Madero vinculó algunas operaciones con operadores
 * de una org diferente (cross-tenant). Supabase aplica RLS sobre los joins, por
 * lo que cuando el usuario consulta sus operaciones, el join a `operators` devuelve
 * null para esos registros → la lista muestra "Sin nombre" y el dropdown del
 * diálogo de pago cae al fallback "Operador".
 *
 * CAUSA RAÍZ
 * ----------
 * El import buscó operadores por nombre sin filtrar por org_id (usó service role
 * sin scope de tenant). Encontró "Lozada", "Universal", etc. en otra org y los
 * usó, en lugar de los de la org destino.
 *
 * SOLUCIÓN
 * --------
 * Los operadores correctos (mismo nombre) ya existen en el org correcto.
 * El script detecta los UUIDs cross-org y los reemplaza por los UUIDs del
 * operador equivalente en el org correcto, en las tres tablas afectadas:
 *   - operations.operator_id
 *   - operation_operators.operator_id
 *   - operator_payments.operator_id
 *
 * Si algún cross-org no tiene equivalente en el org correcto, crea uno.
 *
 * USO
 * ---
 *   npx tsx scripts/fix-orphan-operators.ts            # diagnóstico (dry-run)
 *   npx tsx scripts/fix-orphan-operators.ts --fix      # aplica los cambios
 *
 * =============================================================================
 */

import { createClient } from "@supabase/supabase-js"
import * as path from "path"
import { config } from "dotenv"

config({ path: path.join(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const isDryRun = !process.argv.includes("--fix")

// ─── Helpers ─────────────────────────────────────────────────────────────────

function short(id: string | null | undefined) {
  return id ? `${id.slice(0, 8)}…` : "null"
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("  FIX: OPERADORES CON ORG INCORRECTA (cross-tenant references)")
  console.log(`  Modo: ${isDryRun ? "DRY-RUN (solo lectura)" : "FIX (modifica la BD)"}`)
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

  // ── 1. Obtener todos los orgs ─────────────────────────────────────────────

  const { data: orgs } = await supabase.from("organizations").select("id, name, slug")
  if (!orgs || orgs.length === 0) {
    console.error("❌ No se pudo leer organizations")
    process.exit(1)
  }

  console.log(`📋 Organizaciones en el sistema (${orgs.length}):`)
  orgs.forEach((o) => console.log(`   • ${o.name ?? o.slug} (${short(o.id)})`))

  // ── 2. Por cada org, detectar referencias cross-org en las 3 tablas ──────

  let totalFixed = 0
  let totalErrors = 0

  for (const org of orgs) {
    const orgId = org.id
    const orgLabel = org.name ?? org.slug ?? orgId

    // Obtener todos los operadores del org correcto (usando service role, sin RLS)
    const { data: correctOps } = await supabase
      .from("operators")
      .select("id, name, agency_id")
      .eq("org_id", orgId)

    const correctByName = new Map<string, { id: string; agency_id: string | null }>(
      (correctOps || []).map((o) => [o.name.toLowerCase().trim(), { id: o.id, agency_id: o.agency_id }])
    )

    // ── 2a. operation_operators con cross-org ────────────────────────────────

    const { data: oo } = await supabase
      .from("operation_operators")
      .select("id, operator_id, operators:operator_id(id, name, org_id)")
      .eq("org_id", orgId)

    const wrongOO = (oo || []).filter((r: any) => r.operators && r.operators.org_id !== orgId)

    // ── 2b. operations.operator_id con cross-org ─────────────────────────────

    const { data: ops } = await supabase
      .from("operations")
      .select("id, file_code, operator_id, operators:operator_id(id, name, org_id)")
      .eq("org_id", orgId)
      .not("operator_id", "is", null)

    const wrongOps = (ops || []).filter((r: any) => r.operators && r.operators.org_id !== orgId)

    // ── 2c. operator_payments.operator_id con cross-org ──────────────────────

    const { data: opPmts } = await supabase
      .from("operator_payments")
      .select("id, operator_id, operators:operator_id(id, name, org_id)")
      .eq("org_id", orgId)
      .not("operator_id", "is", null)

    const wrongOpPmts = (opPmts || []).filter((r: any) => r.operators && r.operators.org_id !== orgId)

    // ── 2d. payments.operator_id con cross-org ────────────────────────────────

    const { data: pmts } = await supabase
      .from("payments")
      .select("id, operator_id, operators:operator_id(id, name, org_id)")
      .eq("org_id", orgId)
      .not("operator_id", "is", null)

    const wrongPmts = (pmts || []).filter((r: any) => r.operators && r.operators.org_id !== orgId)

    // ── 2e. iva_purchases.operator_id con cross-org ───────────────────────────

    const { data: ivaPurchases } = await (supabase as any)
      .from("iva_purchases")
      .select("id, operator_id, operators:operator_id(id, name, org_id)")
      .eq("org_id", orgId)
      .not("operator_id", "is", null)

    const wrongIva = (ivaPurchases || []).filter((r: any) => r.operators && r.operators.org_id !== orgId)

    const totalWrong = wrongOO.length + wrongOps.length + wrongOpPmts.length + wrongPmts.length + wrongIva.length

    if (totalWrong === 0) {
      console.log(`✅ ${orgLabel}: sin referencias cross-org\n`)
      continue
    }

    // ── 2d. Construir mapa de correcciones ───────────────────────────────────

    // Recopilar todos los operadores cross-org únicos referenciados en esta org
    const crossOrgOpIds = new Set<string>()
    ;[...wrongOO, ...wrongOps, ...wrongOpPmts].forEach((r: any) => {
      if (r.operator_id) crossOrgOpIds.add(r.operator_id)
    })

    // Obtener info de esos operadores cross-org (name, org actual)
    const { data: crossOrgOps } = await supabase
      .from("operators")
      .select("id, name, org_id, agency_id")
      .in("id", Array.from(crossOrgOpIds))

    const crossOrgById = new Map((crossOrgOps || []).map((o) => [o.id, o]))

    console.log(`\n⚠️  ${orgLabel} — ${totalWrong} referencia(s) cross-org detectadas`)
    console.log(`   operation_operators: ${wrongOO.length}`)
    console.log(`   operations:          ${wrongOps.length}`)
    console.log(`   operator_payments:   ${wrongOpPmts.length}`)
    console.log(`   payments:            ${wrongPmts.length}`)
    console.log(`   iva_purchases:       ${wrongIva.length}`)
    console.log(`\n   Operadores incorrectos detectados:`)

    // Mapa: id_incorrecto → id_correcto
    const idMapping = new Map<string, string>()

    for (const wrongId of crossOrgOpIds) {
      const wrongOp = crossOrgById.get(wrongId)
      const wrongName = wrongOp?.name ?? "desconocido"
      const wrongOrgId = wrongOp?.org_id ?? "?"

      const nameKey = wrongName.toLowerCase().trim()
      const correctOp = correctByName.get(nameKey)

      if (correctOp) {
        idMapping.set(wrongId, correctOp.id)
        console.log(`   ✔  "${wrongName}"`)
        console.log(`      ${short(wrongId)} (org: ${short(wrongOrgId)}) → ${short(correctOp.id)} (org: ${short(orgId)})`)
      } else {
        // No existe en el org correcto → hay que crearlo
        console.log(`   ✖  "${wrongName}" — NO existe en ${orgLabel}, se creará un stub`)
        idMapping.set(wrongId, "__CREATE__" + wrongId)
      }
    }

    if (isDryRun) {
      console.log(`\n   💡 Dry-run: no se modificó nada. Usá --fix para aplicar.`)
      continue
    }

    // ── 2e. Crear stubs para los que no tienen equivalente ───────────────────

    for (const [wrongId, correctId] of idMapping) {
      if (!correctId.startsWith("__CREATE__")) continue

      const wrongOp = crossOrgById.get(wrongId)
      const name = wrongOp?.name ?? `Importado-${short(wrongId)}`

      // Buscar una agency del org correcto (usar la de la primera operación afectada)
      const firstRef = (wrongOps || []).find((o: any) => o.operator_id === wrongId)
      const agencyId = firstRef
        ? (ops || []).find((o: any) => o.id === firstRef.id)?.agency_id ?? null
        : null

      const { data: created, error } = await supabase
        .from("operators")
        .insert({ name, org_id: orgId, agency_id: agencyId })
        .select("id")
        .single()

      if (error || !created) {
        console.error(`   ❌ Error creando stub "${name}":`, error?.message)
        totalErrors++
        idMapping.delete(wrongId)
        continue
      }

      console.log(`   ✅ Stub creado: "${name}" → ${short(created.id)}`)
      idMapping.set(wrongId, created.id)
    }

    // ── 2f. Aplicar correcciones ─────────────────────────────────────────────

    console.log(`\n   🔧 Aplicando correcciones en ${orgLabel}...`)

    for (const [wrongId, correctId] of idMapping) {
      if (correctId.startsWith("__CREATE__")) continue // fallido, skip

      // operation_operators
      const affectedOO = wrongOO.filter((r: any) => r.operator_id === wrongId)
      if (affectedOO.length > 0) {
        const ids = affectedOO.map((r: any) => r.id)
        const { error } = await supabase
          .from("operation_operators")
          .update({ operator_id: correctId })
          .in("id", ids)
        if (error) {
          console.error(`   ❌ operation_operators update error: ${error.message}`)
          totalErrors++
        } else {
          console.log(`   ✅ operation_operators: ${ids.length} fila(s) actualizadas`)
          totalFixed += ids.length
        }
      }

      // operations
      const affectedOps = wrongOps.filter((r: any) => r.operator_id === wrongId)
      if (affectedOps.length > 0) {
        const ids = affectedOps.map((r: any) => r.id)
        const { error } = await supabase
          .from("operations")
          .update({ operator_id: correctId })
          .in("id", ids)
        if (error) {
          console.error(`   ❌ operations update error: ${error.message}`)
          totalErrors++
        } else {
          console.log(`   ✅ operations: ${ids.length} fila(s) actualizadas`)
          totalFixed += ids.length
        }
      }

      // operator_payments
      const affectedOpPmts = wrongOpPmts.filter((r: any) => r.operator_id === wrongId)
      if (affectedOpPmts.length > 0) {
        const ids = affectedOpPmts.map((r: any) => r.id)
        const { error } = await supabase
          .from("operator_payments")
          .update({ operator_id: correctId })
          .in("id", ids)
        if (error) {
          console.error(`   ❌ operator_payments update error: ${error.message}`)
          totalErrors++
        } else {
          console.log(`   ✅ operator_payments: ${ids.length} fila(s) actualizadas`)
          totalFixed += ids.length
        }
      }

      // payments
      const affectedPmts = wrongPmts.filter((r: any) => r.operator_id === wrongId)
      if (affectedPmts.length > 0) {
        const ids = affectedPmts.map((r: any) => r.id)
        const { error } = await supabase
          .from("payments")
          .update({ operator_id: correctId })
          .in("id", ids)
        if (error) {
          console.error(`   ❌ payments update error: ${error.message}`)
          totalErrors++
        } else {
          console.log(`   ✅ payments: ${ids.length} fila(s) actualizadas`)
          totalFixed += ids.length
        }
      }

      // iva_purchases
      const affectedIva = wrongIva.filter((r: any) => r.operator_id === wrongId)
      if (affectedIva.length > 0) {
        const ids = affectedIva.map((r: any) => r.id)
        const { error } = await (supabase as any)
          .from("iva_purchases")
          .update({ operator_id: correctId })
          .in("id", ids)
        if (error) {
          console.error(`   ❌ iva_purchases update error: ${error.message}`)
          totalErrors++
        } else {
          console.log(`   ✅ iva_purchases: ${ids.length} fila(s) actualizadas`)
          totalFixed += ids.length
        }
      }
    }
  }

  // ── 3. Resumen final ───────────────────────────────────────────────────────

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  if (isDryRun) {
    console.log("  DRY-RUN completado. Para aplicar los cambios:")
    console.log("  npx tsx scripts/fix-orphan-operators.ts --fix")
  } else {
    console.log(`  RESULTADO: ${totalFixed} fila(s) corregidas · ${totalErrors} error(es)`)
    if (totalFixed > 0) {
      console.log(`
  ✅ Las operaciones ahora muestran el nombre correcto del operador.
     No es necesario ningún paso adicional — los cambios son inmediatos.
`)
    }
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
}

main().catch((err) => {
  console.error("❌ Error inesperado:", err)
  process.exit(1)
})
