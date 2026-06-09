import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOrgAgencyIds } from "@/lib/organizations"
import {
  getQuotationOptionCalculatedTotal,
  getQuotationOptionCostTotal,
  normalizeManualQuotationTotal,
  roundQuotationMoney,
} from "@/lib/quotations/totals"

export const dynamic = "force-dynamic"

/**
 * PATCH /api/quotations/[id]/price
 *
 * Actualiza SOLO el precio final manual de una opción de la cotización
 * (quotation_options.manual_total_amount). Pensado para el flujo "Generar
 * PDF → Cambiar precio": la agencia pisa el total calculado (lo que devolvió
 * Emilia / la suma de ítems) con un total que incluye su comisión. La página
 * pública y el PDF resuelven el total con getEffectiveQuotationOptionTotal,
 * así ambos muestran el precio manual de forma consistente.
 *
 * Body: { option_id: string, manual_total_amount: number | null }
 *   - null / "" → restablece el precio calculado.
 *
 * NO usa el PATCH general de /api/quotations/[id] porque ese reemplaza todas
 * las opciones e ítems (delete + reinsert) — innecesario y riesgoso para
 * cambiar un solo número.
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

    const optionId = body?.option_id
    if (!optionId || typeof optionId !== "string") {
      return NextResponse.json({ error: "Falta option_id" }, { status: 400 })
    }

    const rawManual = body?.manual_total_amount
    if (rawManual !== null && rawManual !== undefined && rawManual !== "") {
      const parsed = Number(rawManual)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: "El precio debe ser un número mayor a 0" },
          { status: 400 }
        )
      }
    }
    const manualTotal = normalizeManualQuotationTotal(rawManual)

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

    const { data: option } = await supabase
      .from("quotation_options")
      .select("id, calculated_total_amount")
      .eq("id", optionId)
      .eq("quotation_id", id)
      .maybeSingle()
    if (!option) {
      return NextResponse.json({ error: "Opción no encontrada" }, { status: 404 })
    }

    const { data: items } = await supabase
      .from("quotation_items")
      .select("quantity, unit_price, sale_amount, cost_amount")
      .eq("option_id", optionId)

    // calculated_total_amount puede ser null en opciones legacy → recalcular
    // desde los ítems para tener un total de referencia al restablecer.
    const calculatedTotal = option.calculated_total_amount != null
      ? roundQuotationMoney(Number(option.calculated_total_amount))
      : getQuotationOptionCalculatedTotal(items || [])

    // Misma regla de negocio que prepareQuotationOptionsForPersistence: el
    // precio final manual no puede quedar por debajo del costo de la opción.
    if (manualTotal != null) {
      const costTotal = getQuotationOptionCostTotal(items || [])
      if (manualTotal < costTotal) {
        return NextResponse.json(
          { error: `El precio no puede quedar por debajo del costo total de la opción (${costTotal}).` },
          { status: 400 }
        )
      }
    }

    // total_amount de la opción se persiste como manual ?? calculado (mismo
    // contrato que persistence.ts) para los lectores que usan el campo crudo.
    const effectiveTotal = manualTotal ?? calculatedTotal

    const { error: updateError } = await supabase
      .from("quotation_options")
      .update({ manual_total_amount: manualTotal, total_amount: effectiveTotal })
      .eq("id", optionId)
      .eq("quotation_id", id)
    if (updateError) {
      console.error("Error updating quotation option price:", updateError)
      return NextResponse.json({ error: "Error al guardar el precio" }, { status: 500 })
    }

    // El total del header de la cotización es referencial: el de la primera
    // opción (ver POST /api/quotations). Re-sync si editamos esa opción.
    const { data: firstOption } = await supabase
      .from("quotation_options")
      .select("id")
      .eq("quotation_id", id)
      .order("option_number", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (firstOption?.id === optionId) {
      const { error: headerError } = await supabase
        .from("quotations")
        .update({ subtotal: effectiveTotal, total_amount: effectiveTotal })
        .eq("id", id)
      if (headerError) {
        console.error("Error syncing quotation header total:", headerError)
      }
    }

    return NextResponse.json({
      success: true,
      data: { option_id: optionId, manual_total_amount: manualTotal, total_amount: effectiveTotal },
    })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation price PATCH:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
