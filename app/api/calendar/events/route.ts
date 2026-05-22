import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const events: any[] = []

    const isSeller = user.role === "SELLER"

    // ────────────────────────────────────────────────────────────
    // Bug fix 2026-05-15 (reportado por Lozada Gualeguaychú):
    // El código anterior tenía un bypass `isSuperAdmin = no filtrar nada`,
    // que en el modelo SaaS multi-tenant le leakeaba operaciones/pagos/
    // alertas/leads de TODOS los tenants a cualquier SUPER_ADMIN.
    //
    // En el modelo SaaS: SUPER_ADMIN es el owner de SU org, no platform
    // admin de Vibook. getUserAgencyIds ya devuelve solo las agencias de
    // su org (scopeado por users.org_id). Filtrar siempre por esa lista.
    //
    // Si agencyIds está vacío (user huérfano sin agencias) → devolver
    // events vacío. Fail-safe vs leak.
    // ────────────────────────────────────────────────────────────
    if (!isSeller && agencyIds.length === 0) {
      return NextResponse.json({ events: [] })
    }

    // --- Helper to apply role-based filters to an operations query ---
    const applyOperationFilters = (query: any) => {
      if (isSeller) {
        return query.eq("seller_id", user.id)
      }
      // SUPER_ADMIN, ADMIN, CONTABLE, VIEWER: filtrar por las agencias de su org
      return query.in("agency_id", agencyIds)
    }

    // Check-ins de operaciones
    let checkinsQuery = (supabase.from("operations") as any)
      .select("id, destination, checkin_date, file_code, seller_id, agency_id")
      .not("checkin_date", "is", null)
    checkinsQuery = applyOperationFilters(checkinsQuery)
    const { data: checkins } = await checkinsQuery

    if (checkins) {
      for (const op of checkins) {
        events.push({
          id: `checkin-${op.id}`,
          type: "CHECKIN",
          title: `Check-in: ${op.destination}`,
          date: op.checkin_date,
          description: op.file_code || undefined,
          color: "#4F5BD5",
          operationId: op.id,
        })
      }
    }

    // Salidas de operaciones
    let departuresQuery = (supabase.from("operations") as any)
      .select("id, destination, departure_date, file_code, seller_id, agency_id")
      .not("departure_date", "is", null)
    departuresQuery = applyOperationFilters(departuresQuery)
    const { data: departures } = await departuresQuery

    if (departures) {
      for (const op of departures) {
        events.push({
          id: `departure-${op.id}`,
          type: "DEPARTURE",
          title: `Salida: ${op.destination}`,
          date: op.departure_date,
          description: op.file_code || undefined,
          color: "#2CA77F",
          operationId: op.id,
        })
      }
    }

    // Vencimientos de pagos — siempre filtrar por allowedOps de la org
    let opsForPayments = (supabase.from("operations") as any).select("id")
    opsForPayments = applyOperationFilters(opsForPayments)
    const { data: allowedOpsPayments } = await opsForPayments
    const allowedOpIdsForPayments = (allowedOpsPayments || []).map((op: any) => op.id)

    if (allowedOpIdsForPayments.length > 0) {
      const { data: payments } = await (supabase.from("payments") as any)
        .select("id, amount, currency, date_due, payer_type, operation_id, operations:operation_id(destination)")
        .eq("status", "PENDING")
        .in("operation_id", allowedOpIdsForPayments)

      if (payments) {
        for (const payment of payments) {
          events.push({
            id: `payment-${payment.id}`,
            type: "PAYMENT_DUE",
            title: `Pago ${payment.payer_type === "CUSTOMER" ? "de cliente" : "a operador"}: ${Number(payment.amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payment.currency}`,
            date: payment.date_due,
            description: payment.operations?.destination || undefined,
            color: "#EC7B5F",
            operationId: payment.operation_id,
          })
        }
      }
    }

    // Seguimientos de leads — filtrar por agencias de la org
    let leadsQuery = (supabase.from("leads") as any)
      .select("id, contact_name, destination, follow_up_date, assigned_seller_id, agency_id")
      .not("follow_up_date", "is", null)

    if (isSeller) {
      leadsQuery = leadsQuery.eq("assigned_seller_id", user.id)
    } else {
      leadsQuery = leadsQuery.in("agency_id", agencyIds)
    }

    const { data: leads } = await leadsQuery

    if (leads) {
      for (const lead of leads) {
        events.push({
          id: `followup-${lead.id}`,
          type: "FOLLOW_UP",
          title: `Seguimiento: ${lead.contact_name}`,
          date: lead.follow_up_date,
          description: lead.destination || undefined,
          color: "#8B82E8",
          leadId: lead.id,
        })
      }
    }

    // Alertas pendientes — siempre filtrar por allowedOps de la org
    let opsForAlerts = (supabase.from("operations") as any).select("id")
    opsForAlerts = applyOperationFilters(opsForAlerts)
    const { data: allowedOpsAlerts } = await opsForAlerts
    const allowedOpIdsForAlerts = (allowedOpsAlerts || []).map((op: any) => op.id)

    if (allowedOpIdsForAlerts.length > 0) {
      const { data: alerts } = await (supabase.from("alerts") as any)
        .select("id, description, date_due, type, operation_id")
        .eq("status", "PENDING")
        .in("operation_id", allowedOpIdsForAlerts)

      if (alerts) {
        for (const alert of alerts) {
          events.push({
            id: `alert-${alert.id}`,
            type: "REMINDER",
            title: alert.description,
            date: alert.date_due.split("T")[0],
            color: "#4F5BD5",
            operationId: alert.operation_id || undefined,
          })
        }
      }
    }

    return NextResponse.json({ events })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
