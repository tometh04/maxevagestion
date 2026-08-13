/**
 * VIB-63 — Recalcula las comisiones de las ventas compartidas.
 * ============================================================
 *
 * PROBLEMA: desde mayo, toda venta compartida cargada desde Operaciones nació
 * con comisión 0 para los dos vendedores (el porcentaje no llegaba a la
 * pantalla y el diálogo mandaba la mitad de cero). Las que sí tienen números
 * fueron escritas a mano y son inconsistentes entre sí. El fix para las ventas
 * nuevas ya está desplegado; este script corrige las viejas.
 *
 * A diferencia de scripts/recalc-commissions-pending.ts, este NO replica la
 * aritmética: importa `computeOperationCommission` de lib/commissions. Ese es
 * justamente el motivo por el que el script viejo terminó divergiendo del
 * código real.
 *
 * QUÉ HACE
 *   - Recalcula con la regla automática (mitad de lo propio, o absorción según
 *     el modo de cada vendedor), ignorando los porcentajes congelados: son
 *     precisamente los que están mal.
 *   - Crea las comisiones faltantes, corrige las que difieren y elimina las de
 *     vendedores que ya no participan de la operación.
 *
 * SEGURIDAD (data financiera)
 *   - Dry-run por defecto. Escribe solo con --apply.
 *   - --org-id OBLIGATORIO.
 *   - Nunca toca un registro con plata movida: exige status PENDING y
 *     amount_paid = 0. El guard vive en applyCommissionPlan, o sea que es el
 *     mismo que usa la aplicación.
 *   - Antes de escribir guarda un snapshot completo en un archivo JSON y se
 *     puede revertir con --rollback=<archivo>.
 *   - ARS y USD nunca se suman: los totales van separados por moneda.
 *
 * USO
 *   npx tsx scripts/recalc-shared-commissions-vib63.ts --org-id=<uuid>
 *   npx tsx scripts/recalc-shared-commissions-vib63.ts --org-id=<uuid> --apply
 *   npx tsx scripts/recalc-shared-commissions-vib63.ts --rollback=<archivo.json>
 */

import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { writeFileSync, readFileSync } from "fs"
import { resolve } from "path"

import {
  applyCommissionPlan,
  computeOperationCommission,
  type CommissionOperation,
} from "../lib/commissions/calculate"
import { resolveSellerCommissionProfiles } from "../lib/commissions/seller-commission-profile"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const orgId = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
const rollbackFile = args.find((a) => a.startsWith("--rollback="))?.split("=")[1] || null
/**
 * Simula que ciertos vendedores absorben, sin tocar la base. Sirve para
 * mostrarle al cliente el escenario "X absorbe" antes de configurarlo. Se
 * acepta id o parte del nombre, separados por coma. Solo en dry-run: con
 * --apply manda siempre lo que dice la base.
 */
const absorbArg = args.find((a) => a.startsWith("--absorb="))?.split("=")[1] || null

const PAGE = 1000
const EPS = 0.01

type Classification = "NEW" | "FIX" | "OK" | "ORPHAN" | "SKIPPED_PAID"

interface Row {
  operationId: string
  fileCode: string
  currency: string
  sellerId: string
  sellerName: string
  role: string
  fromPct: number | null
  toPct: number | null
  fromAmount: number | null
  toAmount: number | null
  classification: Classification
  rule: string
}

function money(value: number): string {
  return value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}%`
}

/** Paginado: PostgREST corta en 1000 filas por defecto. */
async function fetchAll<T>(
  table: string,
  select: string,
  build: (q: any) => any
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build(admin.from(table).select(select)).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function runRollback(file: string) {
  const snapshot = JSON.parse(readFileSync(resolve(file), "utf8")) as {
    orgId: string
    takenAt: string
    records: any[]
  }

  console.log(`Revirtiendo el snapshot de ${snapshot.takenAt} (org ${snapshot.orgId})`)
  console.log(`Registros en el snapshot: ${snapshot.records.length}`)

  if (!apply) {
    console.log("\nDRY-RUN. Agregá --apply para escribir.")
    return
  }

  // Se borra todo lo que haya hoy para esas operaciones y se reinsertan los
  // registros originales con su id, así el estado queda idéntico al previo.
  const opIds = Array.from(new Set(snapshot.records.map((r) => r.operation_id)))
  for (let i = 0; i < opIds.length; i += 100) {
    const slice = opIds.slice(i, i + 100)
    const { error } = await admin.from("commission_records").delete().in("operation_id", slice)
    if (error) throw new Error(`delete: ${error.message}`)
  }
  for (let i = 0; i < snapshot.records.length; i += 100) {
    const slice = snapshot.records.slice(i, i + 100)
    const { error } = await admin.from("commission_records").insert(slice)
    if (error) throw new Error(`insert: ${error.message}`)
  }
  console.log("Rollback aplicado.")
}

async function main() {
  if (rollbackFile) {
    await runRollback(rollbackFile)
    return
  }

  if (!orgId) {
    console.error("ERROR: --org-id=<uuid> es obligatorio.")
    process.exit(1)
  }

  console.log(`org_id=${orgId}`)
  console.log(apply ? "MODO: APLICAR (escribe en la base)" : "MODO: DRY-RUN (no escribe nada)")

  // 1. Ventas compartidas de la org.
  const operations = await fetchAll<any>("operations", "*", (q) =>
    q.eq("org_id", orgId).not("seller_secondary_id", "is", null)
  )
  console.log(`\nVentas compartidas encontradas: ${operations.length}`)

  if (operations.length === 0) {
    console.log("No hay nada que recalcular.")
    return
  }

  // 2. Comisiones actuales de esas operaciones.
  const opIds = operations.map((o) => o.id)
  const existing: any[] = []
  for (let i = 0; i < opIds.length; i += 100) {
    const { data, error } = await admin
      .from("commission_records")
      .select("*")
      .in("operation_id", opIds.slice(i, i + 100))
    if (error) throw new Error(`commission_records: ${error.message}`)
    existing.push(...(data || []))
  }

  const existingByOp = new Map<string, any[]>()
  for (const record of existing) {
    const list = existingByOp.get(record.operation_id) || []
    list.push(record)
    existingByOp.set(record.operation_id, list)
  }

  // 3. Perfiles de todos los vendedores involucrados, en una sola consulta.
  const sellerIds = new Set<string>()
  for (const op of operations) {
    if (op.seller_id) sellerIds.add(op.seller_id)
    if (op.seller_secondary_id) sellerIds.add(op.seller_secondary_id)
  }
  const profiles = await resolveSellerCommissionProfiles(
    admin,
    orgId,
    Array.from(sellerIds)
  )

  const nameOf = (sellerId: string) =>
    profiles.get(sellerId)?.name || sellerId.slice(0, 8)

  if (absorbArg) {
    if (apply) {
      console.error(
        "ERROR: --absorb es solo para simular en dry-run. Para aplicarlo de verdad,\n" +
          "configurá el modo de cada vendedor en la base y corré el script sin este flag."
      )
      process.exit(1)
    }
    const terms = absorbArg.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    const marcados: string[] = []
    for (const [sellerId, profile] of Array.from(profiles.entries())) {
      const matches = terms.some(
        (t) => sellerId === t || (profile.name || "").toLowerCase().includes(t)
      )
      if (matches) {
        profiles.set(sellerId, { ...profile, mode: "ABSORB" })
        marcados.push(profile.name || sellerId)
      }
    }
    console.log(`\nSIMULACIÓN: absorben ${marcados.join(", ") || "(ninguno coincidió)"}`)
    const sinMatch = terms.filter(
      (t) =>
        !Array.from(profiles.values()).some(
          (p) => p.sellerId === t || (p.name || "").toLowerCase().includes(t)
        )
    )
    if (sinMatch.length > 0) {
      console.log(`   ⚠️  Sin coincidencia: ${sinMatch.join(", ")}`)
    }
  }

  // 4. Comparar.
  const rows: Row[] = []
  const toApply: Array<{ operation: CommissionOperation; plan: ReturnType<typeof computeOperationCommission> }> = []
  const sinPorcentaje = new Set<string>()

  for (const op of operations) {
    const currency = op.sale_currency || op.currency || "USD"
    const storedMargin = Number(op.margin_amount) || 0
    const recalcMargin = (Number(op.sale_amount_total) || 0) - (Number(op.operator_cost) || 0)
    const margin = Math.abs(recalcMargin - storedMargin) > 1 ? recalcMargin : storedMargin

    const operation: CommissionOperation = {
      id: op.id,
      org_id: op.org_id,
      agency_id: op.agency_id,
      seller_id: op.seller_id,
      seller_secondary_id: op.seller_secondary_id,
      margin_amount: margin,
      // Se fuerza AUTO a propósito: los porcentajes congelados de estas
      // operaciones son justamente los que están mal.
      commission_split_mode: "AUTO",
    }

    const plan = computeOperationCommission(operation, profiles)

    for (const warning of plan.warnings) {
      if (warning.code === "missing_percentage") sinPorcentaje.add(warning.sellerId)
    }

    const current = existingByOp.get(op.id) || []
    const currentBySeller = new Map(current.map((r) => [r.seller_id, r]))
    let operationLocked = false

    for (const entry of plan.entries) {
      const record = currentBySeller.get(entry.sellerId)
      const locked =
        record &&
        ((record.status ?? "PENDING") !== "PENDING" || Number(record.amount_paid ?? 0) > 0)

      if (locked) operationLocked = true

      const classification: Classification = locked
        ? "SKIPPED_PAID"
        : !record
          ? "NEW"
          : Math.abs(Number(record.amount ?? 0) - entry.amount) > EPS
            ? "FIX"
            : "OK"

      rows.push({
        operationId: op.id,
        fileCode: op.file_code || op.id.slice(0, 8),
        currency,
        sellerId: entry.sellerId,
        sellerName: nameOf(entry.sellerId),
        role: entry.role,
        fromPct: record ? Number(record.percentage ?? 0) : null,
        toPct: entry.percentage,
        fromAmount: record ? Number(record.amount ?? 0) : null,
        toAmount: entry.amount,
        classification,
        rule: plan.rule,
      })
    }

    // Registros de vendedores que ya no participan.
    const planned = new Set(plan.entries.map((e) => e.sellerId))
    for (const record of current) {
      if (planned.has(record.seller_id)) continue
      const locked =
        (record.status ?? "PENDING") !== "PENDING" || Number(record.amount_paid ?? 0) > 0
      if (locked) operationLocked = true
      rows.push({
        operationId: op.id,
        fileCode: op.file_code || op.id.slice(0, 8),
        currency,
        sellerId: record.seller_id,
        sellerName: nameOf(record.seller_id),
        role: "—",
        fromPct: Number(record.percentage ?? 0),
        toPct: null,
        fromAmount: Number(record.amount ?? 0),
        toAmount: null,
        classification: locked ? "SKIPPED_PAID" : "ORPHAN",
        rule: plan.rule,
      })
    }

    // La operación entera se saltea si algún registro tiene plata movida: no
    // vale la pena dejarla a medias.
    if (!operationLocked) {
      toApply.push({ operation, plan })
    }
  }

  // 5. Informe.
  const byClass = new Map<Classification, Row[]>()
  for (const row of rows) {
    const list = byClass.get(row.classification) || []
    list.push(row)
    byClass.set(row.classification, list)
  }

  console.log("\n=== RESUMEN POR CLASIFICACIÓN ===")
  const labels: Record<Classification, string> = {
    NEW: "Comisiones que faltaban y se van a crear",
    FIX: "Comisiones con monto distinto que se corrigen",
    OK: "Ya estaban bien",
    ORPHAN: "De vendedores que ya no están en la operación (se eliminan)",
    SKIPPED_PAID: "No se tocan porque ya tienen pagos",
  }
  for (const key of ["NEW", "FIX", "ORPHAN", "SKIPPED_PAID", "OK"] as Classification[]) {
    const list = byClass.get(key) || []
    if (list.length === 0) continue
    console.log(`\n${key} — ${labels[key]}: ${list.length}`)
    const porMoneda = new Map<string, { antes: number; despues: number }>()
    for (const row of list) {
      const acc = porMoneda.get(row.currency) || { antes: 0, despues: 0 }
      acc.antes += row.fromAmount ?? 0
      acc.despues += row.toAmount ?? 0
      porMoneda.set(row.currency, acc)
    }
    for (const [currency, acc] of Array.from(porMoneda.entries())) {
      console.log(
        `   ${currency}: antes ${money(acc.antes)} → después ${money(acc.despues)} (${
          acc.despues - acc.antes >= 0 ? "+" : ""
        }${money(acc.despues - acc.antes)})`
      )
    }
  }

  console.log("\n=== POR VENDEDOR ===")
  const bySeller = new Map<string, Map<string, { antes: number; despues: number; n: number }>>()
  for (const row of rows) {
    // Se incluyen las filas OK: aportan lo mismo antes y después, así que no
    // cambian la diferencia pero hacen que el total de cada vendedor sea
    // comparable entre corridas (por ejemplo, entre el escenario general y el
    // de absorción). Solo se excluyen las que no se van a tocar.
    if (row.classification === "SKIPPED_PAID") continue
    const perCurrency = bySeller.get(row.sellerName) || new Map()
    const acc = perCurrency.get(row.currency) || { antes: 0, despues: 0, n: 0 }
    acc.antes += row.fromAmount ?? 0
    acc.despues += row.toAmount ?? 0
    acc.n += 1
    perCurrency.set(row.currency, acc)
    bySeller.set(row.sellerName, perCurrency)
  }
  for (const [seller, perCurrency] of Array.from(bySeller.entries()).sort()) {
    for (const [currency, acc] of Array.from(perCurrency.entries())) {
      const delta = acc.despues - acc.antes
      console.log(
        `${seller.padEnd(28)} ${currency}  ${acc.n.toString().padStart(3)} ops   ` +
          `${money(acc.antes).padStart(12)} → ${money(acc.despues).padStart(12)}   ` +
          `${delta >= 0 ? "+" : ""}${money(delta)}`
      )
    }
  }

  if (sinPorcentaje.size > 0) {
    console.log("\n⚠️  Vendedores sin porcentaje de comisión configurado:")
    for (const sellerId of Array.from(sinPorcentaje)) {
      console.log(`   - ${nameOf(sellerId)} (${sellerId})`)
    }
    console.log("   Sus comisiones quedan en 0. Cargalos en Configuración → Usuarios.")
  }

  const detalle = rows
    .filter((r) => r.classification === "NEW" || r.classification === "FIX" || r.classification === "ORPHAN")
    .sort((a, b) => a.fileCode.localeCompare(b.fileCode))

  console.log(`\n=== DETALLE (${detalle.length} registros) ===`)
  for (const row of detalle) {
    console.log(
      `${row.fileCode.padEnd(16)} ${row.sellerName.padEnd(24)} ${row.role.padEnd(10)} ` +
        `${pct(row.fromPct).padStart(8)} → ${pct(row.toPct).padStart(8)}   ` +
        `${row.currency} ${money(row.fromAmount ?? 0).padStart(12)} → ${money(row.toAmount ?? 0).padStart(12)}   ` +
        `[${row.classification}/${row.rule}]`
    )
  }

  if (!apply) {
    console.log(
      `\nDRY-RUN: no se escribió nada. ${toApply.length} operaciones se modificarían.`
    )
    console.log("Agregá --apply para ejecutar.")
    return
  }

  // 6. Snapshot antes de escribir.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const snapshotPath = resolve(`commission-backup-vib63-${orgId.slice(0, 8)}-${stamp}.json`)
  writeFileSync(
    snapshotPath,
    JSON.stringify({ orgId, takenAt: new Date().toISOString(), records: existing }, null, 2)
  )
  console.log(`\nSnapshot guardado en ${snapshotPath}`)
  console.log(`Para revertir: npx tsx scripts/recalc-shared-commissions-vib63.ts --rollback=${snapshotPath} --apply`)

  // 7. Aplicar, reutilizando el mismo código que usa la aplicación.
  let written = 0
  let removed = 0
  let skipped = 0
  const errors: string[] = []

  for (const { operation, plan } of toApply) {
    const result = await applyCommissionPlan(admin, operation, plan)
    written += result.written.length
    removed += result.removed.length
    skipped += result.skipped.length
    errors.push(...result.errors)

    // La operación vuelve a automático: sus porcentajes congelados eran los que
    // estaban mal.
    const { error } = await admin
      .from("operations")
      .update({
        commission_split_mode: "AUTO",
        commission_pct_primary: plan.pctPrimary,
        commission_pct_secondary: plan.pctSecondary,
      })
      .eq("id", operation.id)
      .eq("org_id", orgId)

    if (error) errors.push(`operations ${operation.id}: ${error.message}`)
  }

  console.log(`\n=== APLICADO ===`)
  console.log(`Comisiones escritas: ${written}`)
  console.log(`Comisiones eliminadas (huérfanas): ${removed}`)
  console.log(`Salteadas por tener pagos: ${skipped}`)
  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} errores:`)
    for (const err of errors) console.log(`   - ${err}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
