import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { hasAdminRole } from "@/lib/permissions"
import { processCommissionsForOperations } from "@/lib/commissions/calculate"
import { ruleApplicability, previewApplication } from "@/lib/commissions/rule-application"
import { logAccountingAction } from "@/lib/accounting/audit"

/**
 * Arrastrar una regla de comisión a las comisiones ya calculadas.
 *
 * GET  = qué va a pasar (para decírselo al usuario antes de tocar plata).
 * POST = hacerlo.
 *
 * El alcance sale de la vigencia de la regla, nunca de un parámetro del
 * cliente: ver el docblock de `lib/commissions/rule-application.ts` para por
 * qué un recálculo global estaría mal.
 */

interface RuleRow {
  id: string
  type: string
  basis: string
  value: number
  seller_id: string | null
  valid_from: string | null
  valid_to: string | null
}

/** Regla + comisiones alcanzadas, o el motivo por el que no se puede. */
async function cargarAlcance(ruleId: string, orgId: string) {
  const supabase = await createServerClient()

  const { data: rule } = await (supabase.from("commission_rules") as any)
    .select("id, type, basis, value, seller_id, valid_from, valid_to")
    .eq("id", ruleId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!rule) return { error: "Regla no encontrada", status: 404 as const }

  const typed = rule as RuleRow

  if (typed.basis !== "FIXED_PERCENTAGE") {
    return {
      error: "Sólo se pueden arrastrar las reglas de porcentaje.",
      status: 400 as const,
    }
  }

  const alcance = ruleApplicability(typed)
  if (!alcance.applicable) {
    return { error: alcance.reason, status: 400 as const }
  }

  let query = (supabase.from("commission_records") as any)
    .select("id, operation_id, status, amount_paid, settled_at, percentage")
    .eq("org_id", orgId)
    .eq("seller_id", alcance.sellerId)
    // Las de servicio no las produce el plan de la operación: tienen su propio
    // vendedor, su propio porcentaje y su propio mes, y recalcular la operación
    // no las toca (ver `applyCommissionPlan`). Contarlas acá prometería un
    // cambio que no va a pasar.
    .neq("kind", "SERVICE")
    // `accrual_date` y no `date_calculated`: el segundo se reescribe en cada
    // recálculo, así que el período se movería solo.
    .gte("accrual_date", alcance.window.from)

  if (alcance.window.to) query = query.lte("accrual_date", alcance.window.to)

  const { data: records, error } = await query

  if (error) {
    console.error("Error leyendo las comisiones a recalcular:", error)
    return { error: "Error al leer las comisiones del período", status: 500 as const }
  }

  return {
    rule: typed,
    window: alcance.window,
    records: (records || []) as any[],
    preview: previewApplication((records || []) as any[], Number(typed.value)),
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await getCurrentUser()
    if (!hasAdminRole((user as any).roles ?? [user.role])) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organizacion asociada" }, { status: 400 })
    }

    const { id } = await params
    const alcance = await cargarAlcance(id, user.org_id)
    if ("error" in alcance) {
      return NextResponse.json({ error: alcance.error }, { status: alcance.status })
    }

    return NextResponse.json({
      percentage: Number(alcance.rule.value),
      window: alcance.window,
      ...alcance.preview,
    })
  } catch (error) {
    console.error("Error in GET /api/settings/commissions/[id]/apply:", error)
    return NextResponse.json({ error: "Error al calcular el alcance" }, { status: 500 })
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await getCurrentUser()
    if (!hasAdminRole((user as any).roles ?? [user.role])) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organizacion asociada" }, { status: 400 })
    }

    const { id } = await params
    const alcance = await cargarAlcance(id, user.org_id)
    if ("error" in alcance) {
      return NextResponse.json({ error: alcance.error }, { status: alcance.status })
    }

    const operationIds = Array.from(
      new Set(alcance.records.map((r) => r.operation_id).filter(Boolean))
    ) as string[]

    if (operationIds.length === 0) {
      return NextResponse.json({
        actualizadas: 0,
        bloqueadas: alcance.preview.bloqueadas,
        message: "No hay comisiones para recalcular en el período de la regla.",
      })
    }

    // Recalcula la operación entera, no sólo la fila de este vendedor: en una
    // venta compartida el reparto se define entre los dos y tocar uno solo
    // dejaría la suma inconsistente. Las comisiones con plata atrás las saltea
    // `applyCommissionPlan`.
    await processCommissionsForOperations(operationIds, user.org_id)

    logAccountingAction({
      userId: user.id,
      action: "UPDATE_COMMISSION",
      entityType: "commission_rule",
      entityId: id,
      details: {
        motivo: "Regla arrastrada a las comisiones ya calculadas",
        percentage: Number(alcance.rule.value),
        seller_id: alcance.rule.seller_id,
        window: alcance.window,
        operaciones: operationIds.length,
        preview: alcance.preview,
      },
    })

    return NextResponse.json({
      actualizadas: alcance.preview.aRecalcular,
      bloqueadas: alcance.preview.bloqueadas,
      operaciones: operationIds.length,
    })
  } catch (error) {
    console.error("Error in POST /api/settings/commissions/[id]/apply:", error)
    return NextResponse.json({ error: "Error al aplicar la regla" }, { status: 500 })
  }
}
