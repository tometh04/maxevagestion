import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { parseLeadOutcomeInput } from "@/lib/leads/outcome"

/**
 * VIB-68: marcar el resultado de un lead (venta / descarte) o reabrirlo.
 *
 * Eje independiente del pipeline: NO toca leads.status ni el funnel. La
 * distinción venta real vs manual se deriva luego de operations.lead_id.
 *
 * Body: { outcome: "SALE" | "DISCARDED" | null }  (null = reabrir)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para editar leads" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = parseLeadOutcomeInput(body?.outcome)
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "outcome inválido. Valores permitidos: SALE, DISCARDED o null." },
        { status: 400 }
      )
    }
    const outcome = parsed.value

    const supabase = (await createServerClient()) as any

    const nowIso = new Date().toISOString()
    const { data: updated, error } = await supabase
      .from("leads")
      .update({
        outcome,
        outcome_at: outcome ? nowIso : null,
        outcome_by: outcome ? user.id : null,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("org_id", userOrgId)
      .select("id, outcome, outcome_at, outcome_by")
      .maybeSingle()

    if (error) {
      console.error("[POST /api/leads/:id/outcome] error:", error)
      return NextResponse.json({ error: "Error al actualizar el resultado del lead" }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ success: true, lead: updated })
  } catch (error: any) {
    console.error("[POST /api/leads/:id/outcome] excepción:", error)
    return NextResponse.json(
      { error: error?.message || "Error al actualizar el resultado del lead" },
      { status: 500 }
    )
  }
}
