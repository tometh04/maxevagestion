/**
 * Limpieza puntual pedida por Yamil (Lozada Rosario, 2026-08-13).
 *
 * El Reporte de Gastos de agosto contaba como gasto de agencia varias salidas
 * de caja que NO son gasto. Este script:
 *
 *  1. Marca 7 egresos (`cash_movements`) como `is_agency_expense = false`
 *     (comisiones pagadas por fuera, retiros/bajas financieras Eurovips, y el
 *     pago de aéreos a Sudameria mal cargado). La plata NO se mueve: siguen
 *     afectando el saldo; solo dejan de contar en el Reporte de Gastos.
 *     100% reversible (volver a poner true).
 *
 *  2. Borra 1 de los 2 "Sueldo Julieta" duplicados del 11/08 (Yamil ya cargó
 *     aparte el de Bs As). Pagar un recurrente crea SOLO un `ledger_movement`
 *     (sin cash_movement), y el saldo sale de ahí, así que borrar la fila
 *     duplicada corrige el reporte Y la caja. Se imprime la fila completa antes
 *     de borrarla por si hay que re-insertarla.
 *
 * El vuelto (CUSTOMER_REFUND) NO se toca acá: ya se excluye del reporte por
 * código (lib/expenses/fetch-expenses.ts).
 *
 * REQUISITOS:
 *  - Correr con `.env.local` apuntando a la base correcta (prod).
 *  - La migración 20260813000001 (columna is_agency_expense) YA aplicada.
 *
 * USO:
 *   npx tsx scripts/cleanup-lozada-non-gasto-outflows.ts            # dry-run
 *   npx tsx scripts/cleanup-lozada-non-gasto-outflows.ts --apply    # ejecuta
 *   npx tsx scripts/cleanup-lozada-non-gasto-outflows.ts --org=<id> # org explícita
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"

config({ path: path.join(__dirname, "../.env.local") })

const APPLY = process.argv.includes("--apply")
const orgArg = process.argv.find((a) => a.startsWith("--org="))?.split("=")[1]

// Ventana de seguridad: solo agosto 2026 (el período del reporte). Evita que un
// notes ILIKE matchee un movimiento viejo por casualidad.
const FROM = "2026-08-01"
const TO = "2026-09-01" // exclusivo

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Los 7 egresos a marcar como "no es gasto". Se matchea por un fragmento
// distintivo de las notas dentro de la ventana de agosto; se exige que matchee
// EXACTAMENTE 1 movimiento (si no, se salta y avisa, no adivina).
const OUTFLOWS: Array<{ label: string; notesLike: string }> = [
  { label: "Retiro Eurovips (no es gasto)", notesLike: "%gasto eurovips%" },
  { label: "Depósitos Eurovips (no es gasto)", notesLike: "%depostios eurovips%" },
  { label: "Comisión emi roca (por fuera)", notesLike: "%comisiones emi roca%" },
  { label: "Comisión victoria (por fuera)", notesLike: "%comisiones victoria%" },
  { label: "Comisiones mes anterior (Camila)", notesLike: "%del mes anterior que no se habian pagado%" },
  { label: "Comisión Yamil (ganancia financiera)", notesLike: "%comisiones Yamil%" },
  { label: "Pago aéreos Sudameria (mal cargado)", notesLike: "%sudameria%" },
]

async function resolveOrgId(): Promise<string> {
  if (orgArg) return orgArg
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .ilike("name", "%Lozada Rosario%")
  if (error) throw new Error(`No pude resolver la org: ${error.message}`)
  if (!data || data.length !== 1) {
    throw new Error(
      `Esperaba 1 org "Lozada Rosario", encontré ${data?.length ?? 0}. Pasá --org=<id>.`
    )
  }
  console.log(`Org: ${data[0].name} (${data[0].id})`)
  return data[0].id
}

async function markOutflows(orgId: string) {
  console.log("\n=== 1) Marcar salidas de caja como NO gasto ===")
  let ok = 0
  for (const item of OUTFLOWS) {
    const { data, error } = await supabase
      .from("cash_movements")
      .select("id, notes, amount, currency, movement_date, type, is_agency_expense")
      .eq("org_id", orgId)
      .eq("type", "EXPENSE")
      .ilike("notes", item.notesLike)
      .gte("movement_date", FROM)
      .lt("movement_date", TO)

    if (error) {
      console.log(`  ⚠️  ${item.label}: error de consulta: ${error.message}`)
      continue
    }
    if (!data || data.length !== 1) {
      console.log(
        `  ⚠️  ${item.label}: matchearon ${data?.length ?? 0} (esperaba 1) — SE SALTA.`
      )
      for (const r of data || []) {
        console.log(`        · ${r.movement_date} ${r.currency} ${r.amount} :: ${r.notes}`)
      }
      continue
    }
    const r = data[0]
    const already = r.is_agency_expense === false
    console.log(
      `  ${already ? "•" : "→"} ${item.label}: ${r.currency} ${r.amount} (${r.movement_date})` +
        (already ? " [ya marcado]" : "")
    )
    if (APPLY && !already) {
      const { error: upErr } = await supabase
        .from("cash_movements")
        .update({ is_agency_expense: false })
        .eq("id", r.id)
        .eq("org_id", orgId)
      if (upErr) {
        console.log(`      ❌ update falló: ${upErr.message}`)
        continue
      }
    }
    ok++
  }
  console.log(`  ${APPLY ? "Marcados" : "Se marcarían"}: ${ok}/${OUTFLOWS.length}`)
}

async function deleteJulietaDuplicate(orgId: string) {
  console.log("\n=== 2) Borrar 1 Sueldo Julieta duplicado (11/08) ===")
  const { data, error } = await supabase
    .from("ledger_movements")
    .select("id, concept, currency, amount_original, movement_date, account_id, created_at")
    .eq("org_id", orgId)
    .eq("type", "EXPENSE")
    .ilike("concept", "Gasto recurrente: Sueldo Julieta%")
    .gte("movement_date", FROM)
    .lt("movement_date", TO)
    .order("created_at", { ascending: true })

  if (error) {
    console.log(`  ⚠️  error de consulta: ${error.message}`)
    return
  }
  const rows = data || []
  console.log(`  Encontrados: ${rows.length}`)
  for (const r of rows) {
    console.log(
      `        · ${r.movement_date} ${r.currency} ${r.amount_original} (created ${r.created_at}) id=${r.id}`
    )
  }
  if (rows.length < 2) {
    console.log("  ⚠️  Menos de 2 filas: NO se borra nada (revisar a mano).")
    return
  }
  if (rows.length > 2) {
    console.log("  ⚠️  Más de 2 filas: ambiguo, NO se borra nada (revisar a mano).")
    return
  }
  // Borrar la más nueva (la duplicada cargada después).
  const target = rows[rows.length - 1]
  console.log(`  → Borrar duplicado más nuevo: id=${target.id}`)
  console.log(`      backup fila: ${JSON.stringify(target)}`)
  if (APPLY) {
    // Sanidad: que no tenga un cash_movement colgado (no debería, los
    // recurrentes no crean cash_movement). Si lo tuviera, no borrar.
    const { data: linked } = await supabase
      .from("cash_movements")
      .select("id")
      .eq("ledger_movement_id", target.id)
    if (linked && linked.length > 0) {
      console.log(`      ❌ tiene cash_movement asociado (${linked.length}): NO se borra.`)
      return
    }
    const { error: delErr } = await supabase
      .from("ledger_movements")
      .delete()
      .eq("id", target.id)
      .eq("org_id", orgId)
    if (delErr) {
      console.log(`      ❌ delete falló: ${delErr.message}`)
      return
    }
    console.log("      ✅ borrado")
  }
}

async function main() {
  console.log(APPLY ? "MODO: APPLY (escribe cambios)" : "MODO: DRY-RUN (no escribe nada)")
  const orgId = await resolveOrgId()
  await markOutflows(orgId)
  await deleteJulietaDuplicate(orgId)
  console.log(
    APPLY
      ? "\n✅ Listo. Regenerá el Reporte de Gastos de agosto para verificar."
      : "\nDry-run OK. Revisá los matches y corré con --apply para ejecutar."
  )
}

main().catch((err) => {
  console.error("❌ Fatal:", err)
  process.exit(1)
})
