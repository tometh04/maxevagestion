import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import { getOverdueOperatorPayments, updateOverduePayments } from "@/lib/accounting/operator-payments"
import {
  getEffectiveOperatorPaymentStatus,
  hasPendingBalance,
} from "@/lib/accounting/operator-payment-settlement"
import {
  DEBT_TYPE_FILTER_ALL,
  matchesDebtTypeFilter,
  resolveDebtType,
} from "@/lib/accounting/operator-payment-reports"
import { loadApprovalRules, getCurrentArsPerUsd } from "@/lib/payments/load-rules"
import { requiresApproval, convertToArs } from "@/lib/payments/approval"
import { notifyApprovers } from "@/lib/payments/notify-approvers"

/** Chunk para los `.in()` (evita URLs gigantes en PostgREST). */
const IN_CHUNK_SIZE = 200

function chunked<T>(items: T[], size = IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/**
 * Mapa operator_payment_id → tipos de servicio asociados. Normalmente hay uno
 * solo por deuda, pero se devuelve lista para no asumirlo.
 */
async function fetchServiceTypesByPayment(
  supabase: any,
  orgId: string,
  paymentIds: string[]
): Promise<Map<string, string[]>> {
  const byPayment = new Map<string, string[]>()
  if (paymentIds.length === 0) return byPayment

  for (const chunk of chunked(paymentIds)) {
    const { data, error } = await (supabase.from("operation_services") as any)
      .select("operator_payment_id, service_type")
      .eq("org_id", orgId)
      .in("operator_payment_id", chunk)

    // No degradar en silencio: si esto falla, el filtro por tipo devolvería un
    // reporte incompleto que igual parece correcto.
    if (error) {
      throw new Error(`Error al resolver tipos de servicio: ${error.message}`)
    }

    for (const row of data || []) {
      if (!row.operator_payment_id || !row.service_type) continue
      const current = byPayment.get(row.operator_payment_id)
      if (current) {
        if (!current.includes(row.service_type)) current.push(row.service_type)
      } else {
        byPayment.set(row.operator_payment_id, [row.service_type])
      }
    }
  }

  return byPayment
}

/** Clave de `operation_operators`: una operación puede tener varios operadores. */
function operatorProductTypeKey(
  operationId: string,
  operatorId: string,
  fileCode?: string | null
): string {
  return `${operationId}|${operatorId}|${fileCode || ""}`
}

/**
 * Mapa (operación, operador[, file]) → `operation_operators.product_type`, que
 * es el tipo que el usuario eligió al cargar el operador en la operación. Es la
 * fuente del tipo para las deudas que NO nacen de un servicio (la mayoría).
 */
async function fetchOperatorProductTypes(
  supabase: any,
  orgId: string,
  operationIds: string[]
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>()
  if (operationIds.length === 0) return byKey

  for (const chunk of chunked(operationIds)) {
    const { data, error } = await (supabase.from("operation_operators") as any)
      .select("operation_id, operator_id, file_code, product_type")
      .eq("org_id", orgId)
      .in("operation_id", chunk)

    if (error) {
      throw new Error(`Error al resolver tipos de producto: ${error.message}`)
    }

    for (const row of data || []) {
      if (!row.product_type) continue
      // Con file_code (para desambiguar varias patas del mismo operador) y sin
      // él (fallback cuando la deuda no lo tiene cargado).
      byKey.set(
        operatorProductTypeKey(row.operation_id, row.operator_id, row.file_code),
        row.product_type
      )
      const looseKey = operatorProductTypeKey(row.operation_id, row.operator_id)
      if (!byKey.has(looseKey)) byKey.set(looseKey, row.product_type)
    }
  }

  return byKey
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Cross-tenant fix (2026-05-18): exigir org_id.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const operatorId = searchParams.get("operatorId") || undefined
    const status = searchParams.get("status") || undefined
    const agencyId = searchParams.get("agencyId")
    // Backward-compat: aceptar dueDateFrom/dueDateTo legacy + nuevos dateFrom/dateTo
    const dateFrom = searchParams.get("dateFrom") || searchParams.get("dueDateFrom") || undefined
    const dateTo = searchParams.get("dateTo") || searchParams.get("dueDateTo") || undefined
    const dateType = (searchParams.get("dateType") || "VENCIMIENTO").toUpperCase()
    const amountMin = searchParams.get("amountMin") || undefined
    const amountMax = searchParams.get("amountMax") || undefined
    const operationSearch = searchParams.get("operationSearch") || undefined
    // Tipo de producto de la deuda (FLIGHT/HOTEL/...), ALL o UNSPECIFIED.
    // Ver lib/accounting/operator-payment-reports.ts.
    const debtType = searchParams.get("debtType") || DEBT_TYPE_FILTER_ALL

    // Update overdue payments first
    await updateOverduePayments(supabase)

    // Build query - obtener TODOS los pagos del operador si se especifica operatorId
    let query = (supabase.from("operator_payments") as any)
      .select(
        `
        *,
        operations:operation_id (id, destination, file_code, sale_amount_total, agency_id, product_type),
        operators:operator_id (id, name, contact_email),
        ledger_movements:ledger_movement_id (id, created_at, receipt_number, method, notes, account_id, financial_accounts:account_id(name))
      `
      )
      // Cross-tenant fix: scopear por org del user.
      .eq("org_id", (user as any).org_id)
      .order("due_date", { ascending: true })

    if (operatorId) {
      query = query.eq("operator_id", operatorId)
    }

    if (status && status !== "UNPAID") {
      query = query.eq("status", status)
    }

    // dateType:
    // - VENCIMIENTO (default): operator_payments.due_date
    // - OPERACION: pre-resolver operation_ids cuya operations.operation_date ∈ [from,to]
    //   y restringir operator_payments.operation_id IN (...). Pagos sin operación quedan fuera.
    if (dateType === "OPERACION" && (dateFrom || dateTo)) {
      let opQuery = (supabase.from("operations") as any)
        .select("id")
        .eq("org_id", (user as any).org_id)
      if (dateFrom) opQuery = opQuery.gte("operation_date", dateFrom)
      if (dateTo) opQuery = opQuery.lte("operation_date", dateTo)
      const { data: matchingOps } = await opQuery.limit(5000)
      const opIds = (matchingOps || []).map((o: any) => o.id)
      if (opIds.length === 0) {
        return NextResponse.json({ payments: [], availableDebtTypes: [] })
      }
      query = query.in("operation_id", opIds)
    } else {
      // VENCIMIENTO (default)
      if (dateFrom) {
        query = query.gte("due_date", dateFrom)
      }
      if (dateTo) {
        // Agregar 23:59:59 para incluir todo el día
        const dateToEnd = new Date(dateTo)
        dateToEnd.setHours(23, 59, 59, 999)
        query = query.lte("due_date", dateToEnd.toISOString())
      }
    }

    const { data: payments, error } = await query

    if (error) {
      console.error("Error fetching operator payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos a operadores" }, { status: 500 })
    }

    // Filtrar por agencia si se especifica
    let filteredPayments = (payments || []).map((payment: any) => ({
      ...payment,
      status: getEffectiveOperatorPaymentStatus(payment),
    }))

    if (status === "UNPAID") {
      filteredPayments = filteredPayments.filter((payment: any) => hasPendingBalance(payment))
    }
    if (agencyId && agencyId !== "ALL") {
      filteredPayments = filteredPayments.filter((p: any) => {
        const operation = p.operations
        return operation && operation.agency_id === agencyId
      })
    }

    // Filtrar por deuda (amount - paid_amount)
    if (amountMin) {
      const minAmount = parseFloat(amountMin)
      if (!isNaN(minAmount)) {
        filteredPayments = filteredPayments.filter((p: any) => {
          const amount = parseFloat(p.amount || "0")
          const paid = parseFloat(p.paid_amount || "0")
          const debt = amount - paid
          return debt >= minAmount
        })
      }
    }

    if (amountMax) {
      const maxAmount = parseFloat(amountMax)
      if (!isNaN(maxAmount)) {
        filteredPayments = filteredPayments.filter((p: any) => {
          const amount = parseFloat(p.amount || "0")
          const paid = parseFloat(p.paid_amount || "0")
          const debt = amount - paid
          return debt <= maxAmount
        })
      }
    }

    // Filtrar por búsqueda de operación (código o destino)
    if (operationSearch) {
      const searchLower = operationSearch.toLowerCase().trim()
      filteredPayments = filteredPayments.filter((p: any) => {
        const operation = p.operations
        if (!operation) return false
        const fileCode = (operation.file_code || "").toLowerCase()
        const destination = (operation.destination || "").toLowerCase()
        return fileCode.includes(searchLower) || destination.includes(searchLower)
      })
    }

    // Tipo de producto: `operator_payments` no lo guarda, se resuelve desde el
    // servicio vinculado o desde el tipo cargado para ese operador en la
    // operación. Ver resolveDebtType().
    const [serviceTypesByPayment, operatorProductTypes] = await Promise.all([
      fetchServiceTypesByPayment(
        supabase,
        (user as any).org_id,
        filteredPayments.map((p: any) => p.id)
      ),
      fetchOperatorProductTypes(
        supabase,
        (user as any).org_id,
        Array.from(
          new Set(
            filteredPayments
              .map((p: any) => p.operation_id)
              .filter((id: string | null): id is string => Boolean(id))
          )
        )
      ),
    ])

    filteredPayments = filteredPayments.map((p: any) => {
      const serviceTypes = serviceTypesByPayment.get(p.id) ?? []
      const operatorProductType = p.operation_id
        ? operatorProductTypes.get(
            operatorProductTypeKey(p.operation_id, p.operator_id, p.file_code)
          ) ??
          operatorProductTypes.get(
            operatorProductTypeKey(p.operation_id, p.operator_id)
          ) ??
          null
        : null

      return {
        ...p,
        service_types: serviceTypes,
        debt_type: resolveDebtType({
          serviceTypes,
          operatorProductType,
          operationProductType: p.operations?.product_type ?? null,
        }),
      }
    })

    // Tipos presentes antes de filtrar: alimenta el selector del cliente para
    // que también ofrezca los tipos custom de la organización.
    const availableDebtTypes = Array.from(
      new Set(filteredPayments.map((p: any) => p.debt_type as string))
    ).sort()

    // Filtrar antes del enriquecido de pasajeros (que es una query por fila).
    if (debtType !== DEBT_TYPE_FILTER_ALL) {
      filteredPayments = filteredPayments.filter((p: any) =>
        matchesDebtTypeFilter(p.debt_type, debtType)
      )
    }

    // Enriquecer pagos con nombre del pasajero principal
    const enrichedPayments = await Promise.all(
      filteredPayments.map(async (payment: any) => {
        if (payment.operations?.id) {
          const { data: mainCustomer } = await (supabase.from("operation_customers") as any)
            .select(`
              customers:customer_id (first_name, last_name)
            `)
            .eq("operation_id", payment.operations.id)
            .eq("role", "MAIN")
            .maybeSingle()
          
          if (mainCustomer?.customers) {
            const c = mainCustomer.customers as any
            const firstName = c.first_name || ""
            const lastName = c.last_name || ""
            payment.operations.main_passenger_name = `${firstName} ${lastName}`.trim()
          }
        }
        return payment
      })
    )

    return NextResponse.json({
      payments: enrichedPayments,
      availableDebtTypes,
    })
  } catch (error) {
    console.error("Error in GET /api/accounting/operator-payments:", error)
    return NextResponse.json({ error: "Error al obtener pagos a operadores" }, { status: 500 })
  }
}

// POST - Crear pago manual a operador (sin operación)
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    // Cross-tenant fix (2026-05-18): exigir org_id para POST.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const {
      operator_id,
      amount,
      currency,
      due_date,
      notes,
    } = body

    // Validaciones
    if (!operator_id || !amount || !currency || !due_date) {
      return NextResponse.json({ error: "Faltan campos requeridos (operator_id, amount, currency, due_date)" }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    // Validar que el operador existe en el org del user
    const { data: operator, error: operatorError } = await (supabase.from("operators") as any)
      .select("id")
      .eq("id", operator_id)
      .eq("org_id", (user as any).org_id)
      .single()

    if (operatorError || !operator) {
      return NextResponse.json({ error: "Operador no encontrado" }, { status: 404 })
    }

    // Approval gate: operator_payments sin operation_id no tienen agency_id directo.
    // Aceptamos agency_id explícito en el body, y si no viene, fallback a la primera
    // agencia del usuario (user_agencies). Antes este fallback no existía y el
    // dialog no mandaba agency_id → needsApproval siempre false → bypass del gate.
    let agencyIdForApproval: string | null = body.agency_id ?? null
    if (!agencyIdForApproval) {
      const { data: userAgencies } = await (supabase.from("user_agencies") as any)
        .select("agency_id")
        .eq("user_id", user.id)
        .limit(1)
      agencyIdForApproval = (userAgencies as any)?.[0]?.agency_id ?? null
    }
    let needsApproval = false
    if (agencyIdForApproval) {
      try {
        const [approvalRules, arsPerUsd] = await Promise.all([
          loadApprovalRules(agencyIdForApproval, supabase),
          getCurrentArsPerUsd(supabase),
        ])
        const amountArs = convertToArs(parseFloat(amount), currency as "ARS" | "USD", arsPerUsd)
        needsApproval = requiresApproval(amountArs, user.role, approvalRules)
      } catch (approvalErr) {
        console.warn("[operator-payments POST] Error evaluating approval rules, defaulting to no-approval:", approvalErr)
      }
    }

    // Crear operator_payment manual (sin operation_id)
    const insertPayload: Record<string, any> = {
      operation_id: null, // Pago manual sin operación
      operator_id,
      amount: parseFloat(amount),
      currency,
      due_date,
      status: "PENDING",
      paid_amount: 0,
      notes: notes || null,
      created_by_user_id: user.id,
    }
    if (needsApproval) {
      insertPayload.approval_status = "PENDING_APPROVAL"
    }

    const { data: operatorPayment, error: paymentError } = await (supabase.from("operator_payments") as any)
      .insert(insertPayload)
      .select()
      .single()

    if (paymentError) {
      console.error("Error creating operator payment:", paymentError)
      return NextResponse.json({ error: `Error al crear pago: ${paymentError.message}` }, { status: 500 })
    }

    if (needsApproval) {
      try {
        await notifyApprovers(operatorPayment, agencyIdForApproval, supabase, user.id)
      } catch (notifyErr) {
        console.warn("[operator-payments POST] notifyApprovers failed (non-fatal):", notifyErr)
      }
      return NextResponse.json({ payment: operatorPayment, requires_approval: true }, { status: 201 })
    }

    return NextResponse.json({ payment: operatorPayment }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/operator-payments:", error)
    return NextResponse.json({ error: error.message || "Error al crear pago a operador" }, { status: 500 })
  }
}

// PATCH - Actualizar pago a operador (moneda, fecha de vencimiento, notas)
//
// El `amount` YA NO se acepta acá (VIB-174). Este endpoint editaba el monto de
// la deuda a pelo: sin auditoría, sin asiento y sin tocar las comisiones que se
// habían liquidado sobre el costo viejo. Nunca tuvo un caller en la UI, así que
// era un arma cargada esperando a que alguien la usara. Cambiar el monto de una
// deuda es un ajuste de liquidación y va por
// POST /api/accounting/operator-payments/[id]/adjust, que deja el rastro.
export async function PATCH(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    // Gate por accounting.write (matrix por agencia). El set previo
    // [ADMIN,SUPER_ADMIN,CONTABLE] coincide con el default de accounting.write;
    // además ahora ORG_OWNER queda habilitado, como en el resto del sistema.
    if (!canPerformAction(user, "accounting", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await request.json()
    const { id, currency, due_date, notes } = body

    if (!id) {
      return NextResponse.json({ error: "Se requiere el ID del pago" }, { status: 400 })
    }

    if (body.amount !== undefined) {
      return NextResponse.json(
        {
          error:
            "El monto de una deuda no se edita directamente. Registrá un ajuste de liquidación para que quede el rastro contable y se corrijan las comisiones.",
          code: "USE_ADJUSTMENT_ENDPOINT",
        },
        { status: 400 },
      )
    }

    // Cross-tenant fix (2026-05-18): exigir org_id y scopear el update.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const updateData: Record<string, any> = {}
    if (currency) updateData.currency = currency
    if (due_date) updateData.due_date = due_date
    if (notes !== undefined) updateData.notes = notes

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 })
    }

    const { data: updated, error } = await (supabase.from("operator_payments") as any)
      .update(updateData)
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .select()
      .single()

    if (error) {
      console.error("Error updating operator payment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payment: updated })
  } catch (error: any) {
    console.error("Error in PATCH /api/accounting/operator-payments:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar pago" }, { status: 500 })
  }
}
