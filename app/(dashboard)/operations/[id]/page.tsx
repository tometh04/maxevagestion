import { getCurrentUser, getUserAgencies } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getUserAgencyIds, resolveOperationAccessScope } from "@/lib/permissions-api"
import { notFound } from "next/navigation"
import { OperationDetailClient } from "@/components/operations/operation-detail-client"
import { getOperationVisibleDocuments } from "@/lib/documents/operation-documents"

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Get operation with related data (INTEGRADO: clientes incluidos en la misma query)
  // 🔴 CROSS-TENANT FIX (2026-05-21): scope por org_id antes del SELECT.
  // Antes solo se filtraba por id → si el user conocía un UUID de operation
  // de otro tenant, veía toda la data. resolveOperationAccessScope abajo
  // chequea, pero ya leakeaba al SELECT-ear. 404 enmascarado.
  const { data: operation, error: operationError } = await supabase
    .from("operations")
    .select(`
      *,
      sellers:seller_id(id, name, email),
      sellers_secondary:seller_secondary_id(id, name, email),
      operators:operator_id(id, name, contact_email, contact_phone),
      agencies:agency_id(id, name, city),
      leads:lead_id(id, contact_name, destination, status),
      operation_customers(
        *,
        customers:customer_id(*)
      ),
      operation_operators(*, operators:operator_id(id, name))
    `)
    .eq("id", id)
    .eq("org_id", (user as any).org_id)
    .single()

  if (operationError || !operation) {
    notFound()
  }

  // Type assertion for operation
  const op = operation as any

  // Check permissions
  const userRole = user.role as string
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  const operationAccessScope = resolveOperationAccessScope(user, op, agencyIds)

  if (!operationAccessScope) {
    notFound()
  }

  // Extraer clientes de la operación (ya están incluidos en la query)
  const operationCustomers = (op.operation_customers || []) as any[]
  
  // Limpiar operation_customers del objeto operation para evitar duplicación
  const { operation_customers, ...operationWithoutCustomers } = op

  // Get documents from the operation, its lead and linked customers.
  // Usar admin client porque los documentos se insertan con service role (bypasa RLS)
  // y el anon client no puede leerlos. El acceso del usuario ya fue verificado arriba.
  const adminClient = createAdminClient()
  const documents = await getOperationVisibleDocuments(adminClient, {
    operationId: id,
    leadId: op.lead_id,
    operationCustomers,
  })

  // 🔴 CROSS-TENANT DEFENSE (2026-05-21): aunque la operation ya está
  // scoped arriba, los siguientes queries usan operation_id como filtro
  // primary. Si por alguna razón el filtro de op no detuvo (race / typo
  // futuro), .eq("org_id") en cada query es defense-in-depth.
  const userOrgId = (user as any).org_id

  // Get payments
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)
    .order("date_due", { ascending: true })

  // Get alerts
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)
    .order("date_due", { ascending: true })

  // Get operation services (servicios adicionales: asiento, transfer, visa, etc.)
  const { data: operationServices } = await (supabase
    .from("operation_services") as any)
    .select("id, service_type, description, operator_id, operator_payment_id, sale_amount, cost_amount, sale_currency, cost_currency, generates_commission, operators:operator_id(id, name)")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)
    .order("created_at", { ascending: true })

  // Get linked operator debts to keep operator selector aligned with payable breakdown.
  // Bug fix 2026-05-21 (VICO): agregamos `currency` al SELECT — lo necesita el
  // dropdown desglosado de "Registrar Pago a Operador" para mostrar la moneda
  // de cada deuda pendiente en su label (ej. "Tower — USD 6.760 pendiente").
  const { data: operatorPaymentsRaw } = await (supabase
    .from("operator_payments") as any)
    .select("id, operator_id, amount, paid_amount, currency, status, operators:operator_id(id, name)")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)
    .order("created_at", { ascending: true })

  // Limpiar operator_payments huérfanos: registros que no están vinculados a ningún
  // operation_service activo y nunca tuvieron dinero aplicado (paid_amount = 0).
  // Esto cubre el caso donde el servicio fue eliminado pero el operator_payment quedó.
  // Solo aplica si la operación usa el sistema de servicios (tiene operation_services).
  const activePaymentIds = new Set(
    (operationServices || [])
      .map((s: any) => s.operator_payment_id)
      .filter(Boolean)
  )
  let operatorPayments = operatorPaymentsRaw || []
  if ((operationServices || []).length > 0 && operatorPaymentsRaw) {
    const orphans = operatorPaymentsRaw.filter(
      (p: any) => !activePaymentIds.has(p.id) && Number(p.paid_amount || 0) === 0 && p.status !== "PAID"
    )
    if (orphans.length > 0) {
      await (supabase.from("operator_payments") as any)
        .delete()
        .in("id", orphans.map((p: any) => p.id))
      operatorPayments = operatorPaymentsRaw.filter((p: any) => activePaymentIds.has(p.id) || Number(p.paid_amount || 0) > 0 || p.status === "PAID")
    }
  }

  // Get operators assigned to the operation (may include operators without operator_payment)
  // Needed so the "Pagar a operador" dialog can list ALL assigned operators,
  // not only the ones that already have a pending operator_payment.
  // operation_operators tiene org_id (migration 20260331000134).
  const { data: operationOperators } = await (supabase
    .from("operation_operators") as any)
    .select("operator_id, operators:operator_id(id, name)")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)
    .order("created_at", { ascending: true })

  // Get stopovers / legs for this operation. operation_legs NO tiene
  // org_id (mig 129) — scopeamos por agency_id que sí tiene NOT NULL.
  const { data: operationLegs } = await (supabase
    .from("operation_legs") as any)
    .select("id, order_index, destination, departure_date, reservation_code_air, airline_name, itr_localizador, hotel_name, reservation_code_hotel, checkin_date, checkout_date")
    .eq("operation_id", id)
    .eq("agency_id", op.agency_id)
    .order("order_index", { ascending: true })

  // Get commission records for this operation
  const { data: commissionRecords } = await (supabase
    .from("commission_records") as any)
    .select("percentage, seller_id, amount")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)

  // Get agencies for edit dialog
  let agencies: Array<{ id: string; name: string }> = []
  if (userRole === "SUPER_ADMIN") {
    const { data } = await supabase.from("agencies").select("id, name").order("name")
    agencies = (data || []) as Array<{ id: string; name: string }>
  } else {
    const userAgencies = await getUserAgencies(user.id)
    agencies = userAgencies
      .filter((ua) => ua.agencies)
      .map((ua) => ({
        id: ua.agency_id,
        name: ua.agencies!.name,
      }))
  }

  // Get sellers for edit dialog.
  // 🔴 CROSS-TENANT FIX (2026-05-21): filtro explícito por org_id —
  // ver CLAUDE.md regla de oro multi-tenant.
  const { data: sellersData } = await supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)
    .order("name")
  const sellers = (sellersData || []) as Array<{ id: string; name: string }>

  // Get operators for edit dialog.
  // 🔴 CROSS-TENANT FIX (2026-05-21): filtro explícito por org_id.
  const { data: operatorsData } = await supabase
    .from("operators")
    .select("id, name")
    .eq("org_id", (user as any).org_id)
    .order("name")
  const operators = (operatorsData || []) as Array<{ id: string; name: string }>

  return (
    <OperationDetailClient
      operation={operationWithoutCustomers}
      customers={operationCustomers || []}
      documents={documents || []}
      payments={payments || []}
      alerts={alerts || []}
      agencies={agencies}
      sellers={sellers}
      operators={operators}
      userRole={userRole}
      operationAccessScope={operationAccessScope}
      canAddServicesOnAgencyOperations={Boolean(user.can_add_services_on_agency_operations)}
      commissionRecords={commissionRecords || []}
      operationServices={operationServices || []}
      operatorPayments={operatorPayments || []}
      operationOperators={operationOperators || []}
      operationLegs={operationLegs || []}
    />
  )
}
