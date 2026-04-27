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

    // Fetch operation via RLS (404 si no accesible).
    // Nota: la tabla operations NO tiene columna customer_id — el link a
    // clientes es M:N vía operation_customers. La resolución del customer
    // MAIN se hace abajo.
    const { data: operation, error: opErr } = await (supabase
      .from("operations") as any)
      .select("id, file_code, destination, sale_amount_total, operator_cost, margin_amount, org_id")
      .eq("id", id)
      .single()

    if (opErr || !operation) {
      console.error("[margin-summary] operations fetch failed:", { id, opErr })
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Fetch invoices asociadas (incluyendo customer_id para agrupar)
    const { data: invoices } = await (supabase.from("invoices") as any)
      .select("id, cbte_nro, pto_vta, cbte_tipo, imp_total, fecha_emision, status, verification_status, cae, customer_id")
      .eq("operation_id", id)
      .order("fecha_emision", { ascending: false })

    const invoicesList = (invoices ?? []) as any[]

    // Fetch ALL customers via M:N operation_customers (ordenados MAIN primero)
    let customer: { id: string; name: string } | null = null
    let resolvedCustomerId: string | null = null
    const customersBreakdown: Array<{
      id: string
      name: string
      role: "MAIN" | "COMPANION"
      invoiced: number
    }> = []

    const { data: opCustomers } = await (supabase.from("operation_customers") as any)
      .select("customer_id, role, customers(id, first_name, last_name)")
      .eq("operation_id", id)
      .order("role", { ascending: true }) // MAIN < COMPANION alfabéticamente

    for (const oc of (opCustomers ?? []) as any[]) {
      if (!oc.customers) continue
      const cid = oc.customer_id as string
      const invoicedToCustomer = invoicesList
        .filter((inv) => inv.customer_id === cid && inv.status === "authorized")
        .reduce((sum, inv) => sum + Number(inv.imp_total || 0), 0)
      customersBreakdown.push({
        id: oc.customers.id,
        name: `${oc.customers.first_name || ""} ${oc.customers.last_name || ""}`.trim(),
        role: oc.role,
        invoiced: invoicedToCustomer,
      })
    }

    const mainOrFirst = (opCustomers ?? []).find((oc: any) => oc.role === "MAIN")
      ?? (opCustomers ?? [])[0]
    if (mainOrFirst?.customers) {
      resolvedCustomerId = mainOrFirst.customer_id
      customer = {
        id: mainOrFirst.customers.id,
        name: `${mainOrFirst.customers.first_name || ""} ${mainOrFirst.customers.last_name || ""}`.trim(),
      }
    }

    // Check AFIP config
    const afipSvc = await getAfipServiceForOrg(supabase, operation.org_id)
    const hasAfipConfig = !!afipSvc

    // Pasamos el customer_id resuelto (direct o M:N) a la pure function
    const summary = calculateMarginSummary(
      { margin_amount: operation.margin_amount, customer_id: resolvedCustomerId },
      invoicesList,
      hasAfipConfig
    )

    return NextResponse.json({
      operation: {
        id: operation.id,
        file_code: operation.file_code,
        destination: operation.destination,
        sale_amount_total: Number(operation.sale_amount_total),
        operator_cost: Number(operation.operator_cost),
        margin_amount: Number(operation.margin_amount),
        customer,
        customers: customersBreakdown,
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
