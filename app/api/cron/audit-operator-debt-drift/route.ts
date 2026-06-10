import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * POST /api/cron/audit-operator-debt-drift
 *
 * Detecta drift entre los DOS modelos de costo del operador y registra
 * alertas internas si el desvío supera thresholds configurables. Si no
 * tomamos nota, el bug de VICO/FREE WAY 2026-05-22 se repite — el detalle
 * del operador muestra una deuda que no matchea la realidad operativa.
 *
 * Compara, por (org, operator):
 *   A) SUM(operation_operators.cost)       — costo declarado en operations
 *   B) SUM(operator_payments.amount)       — deuda generada (fuente de verdad)
 *
 * Si |A − B| > $1.000 USD-equivalente o |A − B| / A > 5%, crea un alert
 * tipo `OPERATOR_DEBT_DRIFT` para admins del org. El alert linkea al
 * operador y muestra el diff para que el contable lo audite.
 *
 * Auth: Bearer CRON_SECRET (patrón estándar de /api/cron/*).
 *
 * Idempotente: si ya existe un alert OPEN del mismo tipo para el mismo
 * (org, operator), no se duplica — se actualiza el monto del drift.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any

  // Thresholds: cualquiera de los dos dispara el alert.
  const ABS_THRESHOLD_USD = 1000
  const REL_THRESHOLD_PCT = 0.05 // 5%
  // Tipo de cambio aproximado para comparación cross-currency.
  // No es contabilidad, es solo para decidir si el drift es material.
  const USD_TO_ARS_APPROX = 1000

  // ─── 1. Fetch operation_operators agregado por (org, operator) ──────
  // RPC get_operator_cost_aggregated: 1 round-trip SQL en lugar de
  // paginación manual en Node.js (mig 20260610000002).
  const { data: declaredRaw, error: declaredErr } = await admin.rpc(
    "get_operator_cost_aggregated"
  )

  if (declaredErr || !declaredRaw) {
    console.error("[audit-drift] Error llamando get_operator_cost_aggregated:", declaredErr)
    return NextResponse.json({ error: "RPC get_operator_cost_aggregated falló", detail: declaredErr?.message }, { status: 500 })
  }

  const declared = declaredRaw as Array<{ org_id: string; operator_id: string; currency: string; declared_total: number }>

  // ─── 2. Fetch operator_payments agregado por (org, operator, currency)
  const { data: registeredRaw, error: registeredErr } = await admin.rpc(
    "get_operator_payments_aggregated"
  )

  if (registeredErr || !registeredRaw) {
    console.error("[audit-drift] Error llamando get_operator_payments_aggregated:", registeredErr)
    return NextResponse.json({ error: "RPC get_operator_payments_aggregated falló", detail: registeredErr?.message }, { status: 500 })
  }

  const registered: Record<string, number> = {}
  for (const row of registeredRaw as Array<{ org_id: string; operator_id: string; currency: string; registered_total: number }>) {
    if (!row.org_id) continue
    const key = `${row.org_id}::${row.operator_id}::${row.currency || "ARS"}`
    registered[key] = Number(row.registered_total) || 0
  }

  // ─── 3. Detectar drift material
  type DriftRow = {
    org_id: string
    operator_id: string
    currency: string
    declared: number
    registered: number
    drift_abs: number
    drift_pct: number
    drift_usd_equiv: number
  }
  const drifts: DriftRow[] = []

  // Considerar también (org, operator) que tienen operator_payments pero
  // NO operation_operators (registered sin declared).
  const allKeys = new Set<string>([
    ...declared.map((d) => `${d.org_id}::${d.operator_id}::${d.currency}`),
    ...Object.keys(registered),
  ])

  for (const key of Array.from(allKeys)) {
    const [orgId, operatorId, currency] = key.split("::")
    const dRow = declared.find(
      (d) => d.org_id === orgId && d.operator_id === operatorId && d.currency === currency,
    )
    const declaredTotal = dRow?.declared_total || 0
    const registeredTotal = registered[key] || 0
    const driftAbs = Math.abs(declaredTotal - registeredTotal)
    const driftPct = declaredTotal > 0 ? driftAbs / declaredTotal : driftAbs > 0 ? 1 : 0
    const driftUsdEquiv = currency === "ARS" ? driftAbs / USD_TO_ARS_APPROX : driftAbs
    if (driftUsdEquiv >= ABS_THRESHOLD_USD || driftPct >= REL_THRESHOLD_PCT) {
      drifts.push({
        org_id: orgId,
        operator_id: operatorId,
        currency,
        declared: Math.round(declaredTotal * 100) / 100,
        registered: Math.round(registeredTotal * 100) / 100,
        drift_abs: Math.round(driftAbs * 100) / 100,
        drift_pct: Math.round(driftPct * 10000) / 100,
        drift_usd_equiv: Math.round(driftUsdEquiv * 100) / 100,
      })
    }
  }

  // ─── 4. Crear/actualizar alerts. Idempotente vía type+operator_id+org.
  let created = 0
  let updated = 0
  for (const d of drifts) {
    // Buscar alert previo OPEN del mismo tipo para este operador.
    const { data: existing } = await admin
      .from("alerts")
      .select("id, description")
      .eq("type", "OPERATOR_DEBT_DRIFT")
      .eq("org_id", d.org_id)
      .eq("status", "PENDING")
      .ilike("description", `%${d.operator_id}%`)
      .maybeSingle()

    const description =
      `Operador ${d.operator_id}: drift de ${d.currency} ${d.drift_abs.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ` +
      `(${d.drift_pct.toFixed(1)}%) entre costo declarado (${d.declared.toLocaleString("es-AR", { minimumFractionDigits: 2 })}) ` +
      `y deuda registrada (${d.registered.toLocaleString("es-AR", { minimumFractionDigits: 2 })}). ` +
      `Auditar caso por caso antes de migrar el cálculo de deuda a la fuente nueva.`

    if (existing) {
      await admin
        .from("alerts")
        .update({
          description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as any).id)
      updated++
    } else {
      await admin.from("alerts").insert({
        type: "OPERATOR_DEBT_DRIFT",
        org_id: d.org_id,
        description,
        date_due: new Date().toISOString().split("T")[0],
        status: "PENDING",
      })
      created++
    }
  }

  return NextResponse.json({
    checked: allKeys.size,
    drifts_detected: drifts.length,
    alerts_created: created,
    alerts_updated: updated,
    sample: drifts.slice(0, 10),
  })
}
