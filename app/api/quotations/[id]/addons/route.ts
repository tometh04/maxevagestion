import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOrgAgencyIds } from "@/lib/organizations"
import { roundQuotationMoney } from "@/lib/quotations/totals"

export const dynamic = "force-dynamic"

/**
 * PATCH /api/quotations/[id]/addons
 *
 * Actualiza los adicionales globales de la cotización: seguro
 * (insurance_amount) y traslado (transfer_amount). Pensado para el flujo
 * "Generar PDF": la agencia carga un monto de seguro y/o traslado que se
 * suma al total que ve el cliente y se muestra desglosado en el PDF/template.
 *
 * Body: { insurance_amount?: number, transfer_amount?: number }
 *   - Montos en quotations.currency. 0 / ausente = sin adicional.
 *
 * Son globales (no por opción), por eso viven en quotations y no en
 * quotation_options. No se hace delete + reinsert de opciones/items: solo
 * se piso un par de columnas del header.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { id } = await params
    const supabase: any = await createServerClient()
    const body = await request.json()

    // Normaliza un monto de adicional: ausente/"" → 0. Rechaza negativos o
    // no numéricos (mismo contrato que el CHECK >= 0 de la migración).
    const parseAddon = (value: unknown, label: string): number | { error: string } => {
      if (value === null || value === undefined || value === "") return 0
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return { error: `El monto de ${label} debe ser un número mayor o igual a 0` }
      }
      return roundQuotationMoney(parsed)
    }

    const insurance = parseAddon(body?.insurance_amount, "seguro")
    if (typeof insurance === "object") {
      return NextResponse.json({ error: insurance.error }, { status: 400 })
    }
    const transfer = parseAddon(body?.transfer_amount, "traslado")
    if (typeof transfer === "object") {
      return NextResponse.json({ error: transfer.error }, { status: 400 })
    }

    // Cross-tenant fix: filtro explícito, no confiar en RLS. La cotización
    // debe pertenecer a una agencia del org del user. 404 enmascarado.
    const { data: quotation } = await supabase
      .from("quotations")
      .select("id, agency_id, seller_id")
      .eq("id", id)
      .maybeSingle()
    if (!quotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }
    const agencyIds = await getOrgAgencyIds(user.org_id)
    if (!agencyIds || !agencyIds.includes(quotation.agency_id)) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }
    if (user.role === "SELLER" && quotation.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso" }, { status: 403 })
    }

    const { error: updateError } = await supabase
      .from("quotations")
      .update({ insurance_amount: insurance, transfer_amount: transfer })
      .eq("id", id)
    if (updateError) {
      console.error("Error updating quotation addons:", updateError)
      return NextResponse.json({ error: "Error al guardar los adicionales" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: { insurance_amount: insurance, transfer_amount: transfer },
    })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation addons PATCH:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
