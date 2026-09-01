import { getCurrentUser, getUserAgencies } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getUserAgencyIds, resolveOperationAccessScope, canRegisterPaymentsOnAgencyOperations, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { notFound } from "next/navigation"
import { OperationDetailClient } from "@/components/operations/operation-detail-client"
import { getOperationVisibleDocuments } from "@/lib/documents/operation-documents"
import {
  SELLER_OPTION_ROLES,
  SELLER_OPTION_SELECT,
  type SellerOption,
} from "@/lib/sellers/seller-option"
import { resolveEffectiveSellerOptions } from "@/lib/sellers/effective-seller-options"

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

  // Percepciones (RG 5617/3819) asociadas a los pagos de esta operación
  const paymentIds = (payments || []).map((p: any) => p.id)
  let paymentWithholdings: any[] = []
  if (paymentIds.length > 0) {
    const { data: wData } = await (supabase.from("tax_withholdings") as any)
      .select("source_id, type, amount, currency")
      .in("source_id", paymentIds)
      .eq("source_type", "PAYMENT")
      .eq("org_id", userOrgId)
      .in("type", ["PERCEPCION_RG5617_30", "PERCEPCION_RG3819_5"])
    paymentWithholdings = wData || []
  }

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
    .select("id, operator_id, amount, paid_amount, currency, status, due_date, operators:operator_id(id, name)")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)
    .order("created_at", { ascending: true })

  const operatorPayments = operatorPaymentsRaw || []

  // Get operators assigned to the operation (may include operators without operator_payment)
  // Needed so the "Pagar a operador" dialog can list ALL assigned operators,
  // not only the ones that already have a pending operator_payment.
  // operation_operators tiene org_id (migration 20260331000134).
  const { data: operationOperators } = await (supabase
    .from("operation_operators") as any)
    .select("id, operator_id, cost, cost_currency, product_type, notes, sale_amount, passenger_detail, file_code, payment_due_date, operators:operator_id(id, name)")
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
  const { data: commissionRecordsRaw } = await (supabase
    .from("commission_records") as any)
    .select("percentage, seller_id, amount, kind")
    .eq("operation_id", id)
    .eq("org_id", userOrgId)

  // La pantalla usa el PRIMER registro como "el porcentaje de comisión de la
  // operación", así que el orden no puede quedar librado a la base: primero el
  // vendedor principal, después el resto de los vendedores, y al final la
  // comisión del administrador (VIB-102), que es un 5% sobre la venta ajena y
  // no describe el trato de esta operación.
  const commissionRank = (record: any): number => {
    if (record?.kind === "ADVISOR_MANAGER") return 2
    return record?.seller_id === op.seller_id ? 0 : 1
  }
  const commissionRecords = [...((commissionRecordsRaw as any[]) || [])].sort(
    (a, b) => commissionRank(a) - commissionRank(b)
  )

  // Comisión al referidor (VIB-62): si el cliente MAIN vino referido, mostrar
  // cuánto y a quién le corresponde por esta venta.
  //
  // VIB-86: el vendedor que carga la venta no tiene que ver cuánto se lleva el
  // referidor. La interfaz ya no lo dibujaba, pero el dato viajaba igual en el
  // payload de la página; ahora directamente no se consulta.
  const permsMatrix = await resolveUserPermissions(
    supabase as any,
    user.id,
    userOrgId,
    (user as any).roles ?? [user.role],
    agencyIds,
  )
  const puedeVerComisionReferido = canPerformAction(user, "referrals", "read", permsMatrix)

  const { data: referralCommission } = puedeVerComisionReferido
    ? await (supabase.from("referral_commissions") as any)
        .select("amount, percentage, base_amount, currency, status, referral_partners:referral_partner_id(name)")
        .eq("operation_id", id)
        .eq("org_id", userOrgId)
        .maybeSingle()
    : { data: null }

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
    .select(SELLER_OPTION_SELECT)
    .in("role", SELLER_OPTION_ROLES)
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)
    .order("name")
  // Porcentaje EFECTIVO, no la columna cruda: el tope del reparto compartido
  // tiene que decir lo mismo que valida el servidor (VIB-173).
  const sellers: SellerOption[] = await resolveEffectiveSellerOptions(
    supabase,
    (user as any).org_id,
    sellersData
  )

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
      canRegisterAgencyPayments={canRegisterPaymentsOnAgencyOperations(user)}
      commissionRecords={commissionRecords || []}
      referralCommission={referralCommission || null}
      operationServices={operationServices || []}
      operatorPayments={operatorPayments || []}
      operationOperators={operationOperators || []}
      operationLegs={operationLegs || []}
      paymentWithholdings={paymentWithholdings}
    />
  )
}
