import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { calculateMarginSummary } from "@/lib/accounting/margin-summary"

export const dynamic = "force-dynamic"

/**
 * GET /api/operations/:id/margin-summary
 *
 * Devuelve el estado de facturación de una operación:
 *   - margen total, ya facturado, restante
 *   - si se puede facturar y por qué no si bloqueado
 *   - lista de facturas emitidas (con CAE, status, verification_status)
 *
 * RLS: si el user no pertenece al org de la operación, 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "operations")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    // Fetch operation via RLS (404 si no accesible)
    const { data: operation, error: opErr } = await (supabase
      .from("operations") as any)
      .select("id, file_code, destination, sale_amount_total, operator_cost, margin_amount, customer_id, org_id")
      .eq("id", id)
      .single()

    if (opErr || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Fetch invoices asociadas
    const { data: invoices } = await (supabase.from("invoices") as any)
      .select("id, cbte_nro, pto_vta, cbte_tipo, imp_total, fecha_emision, status, verification_status, cae")
      .eq("operation_id", id)
      .order("fecha_emision", { ascending: false })

    const invoicesList = (invoices ?? []) as any[]

    // Fetch customer name (opcional)
    let customer: { id: string; name: string } | null = null
    if (operation.customer_id) {
      const { data: cus } = await (supabase.from("customers") as any)
        .select("id, first_name, last_name")
        .eq("id", operation.customer_id)
        .maybeSingle()
      if (cus) {
        customer = {
          id: cus.id,
          name: `${cus.first_name || ""} ${cus.last_name || ""}`.trim(),
        }
      }
    }

    // Check AFIP config
    const afipSvc = await getAfipServiceForOrg(supabase, operation.org_id)
    const hasAfipConfig = !!afipSvc

    const summary = calculateMarginSummary(operation, invoicesList, hasAfipConfig)

    return NextResponse.json({
      operation: {
        id: operation.id,
        file_code: operation.file_code,
        destination: operation.destination,
        sale_amount_total: Number(operation.sale_amount_total),
        operator_cost: Number(operation.operator_cost),
        margin_amount: Number(operation.margin_amount),
        customer,
        has_afip_emisor: hasAfipConfig,
      },
      summary,
      invoices: invoicesList.map((i) => ({
        id: i.id,
        cbte_nro: i.cbte_nro,
        pto_vta: i.pto_vta,
        cbte_tipo: i.cbte_tipo,
        imp_total: Number(i.imp_total),
        fecha_emision: i.fecha_emision,
        status: i.status,
        verification_status: i.verification_status,
        cae: i.cae,
      })),
    })
  } catch (error: any) {
    console.error("Error in GET /api/operations/[id]/margin-summary:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
