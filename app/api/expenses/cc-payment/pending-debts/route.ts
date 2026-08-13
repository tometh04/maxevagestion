import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * GET /api/expenses/cc-payment/pending-debts
 *
 * Lista deudas de operador PENDIENTES para el selector "Cancela deuda" del
 * pago de resumen de tarjeta. Por defecto filtra al operador cuyo nombre
 * matchea "Tarjeta de crédito" (el que usa el cliente para cargar servicios de
 * pasajeros pagados con la tarjeta), pero permite cambiar a cualquier operador
 * (?operatorId=...) por si algo quedó mal cargado.
 *
 * Read-only. No mueve plata. La liquidación real ocurre en POST /cc-payment.
 */

const MONEY_EPSILON = 0.005

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "read") && !canPerformAction(user, "cash", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver deudas de operador" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const currency = searchParams.get("currency") // ARS | USD (moneda del resumen)
    const operatorIdParam = searchParams.get("operatorId") // override explícito
    const agencyId = searchParams.get("agencyId")
    const search = (searchParams.get("search") || "").trim().toLowerCase()

    // Operadores del org (para el selector "buscar en otro operador").
    const { data: operators } = await (supabase.from("operators") as any)
      .select("id, name")
      .eq("org_id", userOrgId)
      .order("name", { ascending: true })

    const operatorList = (operators || []) as Array<{ id: string; name: string }>

    // Resolver el operador por defecto: el que se llama "Tarjeta de crédito"
    // (match laxo por nombre). Si el caller pasa operatorId, ese manda.
    const defaultCcOperator = operatorList.find((o) =>
      /tarjeta\s+de\s+cr/i.test(o.name || "")
    )
    const resolvedOperatorId = operatorIdParam || defaultCcOperator?.id || null

    // Deudas pendientes (PENDING/OVERDUE con saldo > 0), scopeadas por org.
    let query = (supabase.from("operator_payments") as any)
      .select("id, operation_id, operator_id, amount, paid_amount, currency, due_date, status, notes, file_code")
      .eq("org_id", userOrgId)
      .in("status", ["PENDING", "OVERDUE"])
      .order("due_date", { ascending: true })

    if (resolvedOperatorId) query = query.eq("operator_id", resolvedOperatorId)
    if (currency && currency !== "ALL") query = query.eq("currency", currency)

    const { data: debtsRaw, error } = await query

    if (error) {
      console.error("Error fetching pending operator debts:", error)
      return NextResponse.json({ error: "Error al obtener deudas de operador" }, { status: 500 })
    }

    // Filtrar por saldo pendiente real (amount - paid_amount > epsilon).
    const debts = (debtsRaw || []).filter((d: any) => {
      const pending = Number(d.amount || 0) - Number(d.paid_amount || 0)
      return pending > MONEY_EPSILON
    })

    if (debts.length === 0) {
      return NextResponse.json({
        debts: [],
        operators: operatorList,
        default_operator_id: resolvedOperatorId,
      })
    }

    // Enriquecer: nombre de operador, operación (código/destino/oficina) y
    // pasajero principal, todo en batch y scopeado por org.
    const operationIds = Array.from(
      new Set(debts.map((d: any) => d.operation_id).filter(Boolean))
    ) as string[]

    const operatorNameById = new Map(operatorList.map((o) => [o.id, o.name]))

    const operationById = new Map<string, { file_code: string | null; destination: string | null; agency_id: string | null }>()
    if (operationIds.length > 0) {
      const { data: ops } = await (supabase.from("operations") as any)
        .select("id, file_code, destination, agency_id")
        .in("id", operationIds)
        .eq("org_id", userOrgId)
      for (const op of ops || []) {
        operationById.set(op.id, {
          file_code: op.file_code ?? null,
          destination: op.destination ?? null,
          agency_id: op.agency_id ?? null,
        })
      }
    }

    // Pasajero principal por operación (operation_customers role=MAIN → customers).
    const passengerByOperation = new Map<string, string>()
    if (operationIds.length > 0) {
      const { data: mainCustomers } = await (supabase.from("operation_customers") as any)
        .select("operation_id, role, customers:customer_id (first_name, last_name)")
        .in("operation_id", operationIds)
        .eq("role", "MAIN")
      for (const mc of mainCustomers || []) {
        const c = (mc as any).customers
        if (c) {
          const full = `${c.first_name || ""} ${c.last_name || ""}`.trim()
          if (full) passengerByOperation.set((mc as any).operation_id, full)
        }
      }
    }

    let enriched = debts.map((d: any) => {
      const op = d.operation_id ? operationById.get(d.operation_id) : null
      return {
        id: d.id,
        operation_id: d.operation_id,
        operator_id: d.operator_id,
        operator_name: operatorNameById.get(d.operator_id) || "Operador",
        currency: d.currency,
        amount: Number(d.amount || 0),
        paid_amount: Number(d.paid_amount || 0),
        pending_amount: Number((Number(d.amount || 0) - Number(d.paid_amount || 0)).toFixed(2)),
        due_date: d.due_date,
        status: d.status,
        notes: d.notes ?? null,
        file_code: d.file_code ?? op?.file_code ?? null,
        destination: op?.destination ?? null,
        agency_id: op?.agency_id ?? null,
        passenger_name: d.operation_id ? passengerByOperation.get(d.operation_id) ?? null : null,
      }
    })

    // Filtros client-side: oficina y búsqueda por código/destino/pasajero.
    if (agencyId && agencyId !== "ALL") {
      enriched = enriched.filter((d: any) => d.agency_id === agencyId)
    }
    if (search) {
      enriched = enriched.filter((d: any) =>
        [d.file_code, d.destination, d.passenger_name, d.notes]
          .filter(Boolean)
          .some((v: string) => v.toLowerCase().includes(search))
      )
    }

    return NextResponse.json({
      debts: enriched,
      operators: operatorList,
      default_operator_id: resolvedOperatorId,
    })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/cc-payment/pending-debts:", error)
    return NextResponse.json({ error: "Error al obtener deudas de operador" }, { status: 500 })
  }
}
