import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { revalidateTag, CACHE_TAGS } from "@/lib/cache"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import type { UserRole } from "@/lib/permissions"

// Forzar ruta dinámica (usa cookies para autenticación)
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Permission check: verify the user can access the operators module
    if (!canAccessModule(user.role as UserRole, "operators")) {
      return NextResponse.json({ error: "No tiene permisos para acceder a operadores" }, { status: 403 })
    }

    // Get all operators with their operations and payments
    let query = supabase
      .from("operators")
      .select(
        `
        *,
        operations:operations!operator_id (
          id,
          operator_cost,
          currency,
          status,
          departure_date,
          payments:payments!operation_id (
            id,
            amount,
            currency,
            status,
            direction,
            date_due,
            date_paid
          )
        )
      `,
      )

    // Multi-tenant: filtrar por org del usuario (operators.org_id es NOT NULL)
    if (user.org_id) {
      query = query.eq("org_id", user.org_id)
    }

    // SELLERs adicionalmente ven solo operators vinculados a operaciones de sus agencias
    if (user.role === "SELLER") {
      const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as UserRole)
      if (agencyIds.length === 0) {
        return NextResponse.json({ operators: [] })
      }
      const { data: agencyOperations } = await supabase
        .from("operations")
        .select("operator_id")
        .in("agency_id", agencyIds)
        .not("operator_id", "is", null)

      const agencyOperatorIds = Array.from(
        new Set((agencyOperations || []).map((op: any) => op.operator_id).filter(Boolean))
      )
      if (agencyOperatorIds.length === 0) {
        return NextResponse.json({ operators: [] })
      }
      query = query.in("id", agencyOperatorIds)
    }

    const { data, error } = await query.order("name")

    if (error) {
      console.error("Error fetching operators:", error)
      throw new Error("Error al obtener operadores")
    }

    // Feature flag: usar operator_payments como fuente de verdad (VICO ON)
    const useOperatorPayments = user.org_id
      ? await getOrgFeatureFlag(supabase, user.org_id, "features.operator_debt_from_operator_payments")
      : false

    let operatorsWithStats: any[]

    if (useOperatorPayments) {
      // ─── Modelo NUEVO: operator_payments ─────────────────────────────────
      const { data: allPaymentsRaw } = await supabase
        .from("operator_payments")
        .select("id, operator_id, amount, paid_amount, currency, status, due_date")
        .eq("org_id", user.org_id!)

      const allPayments = (allPaymentsRaw || []) as any[]

      const paymentsByOperator: Record<string, any[]> = {}
      for (const p of allPayments) {
        if (!p.operator_id) continue
        if (!paymentsByOperator[p.operator_id]) paymentsByOperator[p.operator_id] = []
        paymentsByOperator[p.operator_id].push(p)
      }

      operatorsWithStats = (data || []).map((op: any) => {
        const operations = (op.operations || []) as any[]
        const payments = paymentsByOperator[op.id] || []

        const totalCostByCurrency: Record<string, number> = {}
        const paidAmountByCurrency: Record<string, number> = {}

        for (const p of payments) {
          const cur = (p.currency || "ARS") as string
          totalCostByCurrency[cur] = (totalCostByCurrency[cur] || 0) + (Number(p.amount) || 0)
          paidAmountByCurrency[cur] = (paidAmountByCurrency[cur] || 0) + (Number(p.paid_amount) || 0)
        }

        const balanceByCurrency: Record<string, number> = {}
        const allCurrencies = Array.from(
          new Set([...Object.keys(totalCostByCurrency), ...Object.keys(paidAmountByCurrency)])
        )
        for (const cur of allCurrencies) {
          balanceByCurrency[cur] = Math.max(0, (totalCostByCurrency[cur] || 0) - (paidAmountByCurrency[cur] || 0))
        }

        const nextPayment = payments
          .filter((p: any) => {
            if (p.status === "PAID") return false
            const remaining = (Number(p.amount) || 0) - (Number(p.paid_amount) || 0)
            return remaining > 0.001
          })
          .sort((a: any, b: any) => {
            if (!a.due_date && !b.due_date) return 0
            if (!a.due_date) return 1
            if (!b.due_date) return -1
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          })[0]

        return {
          id: op.id,
          name: op.name,
          contact_name: op.contact_name,
          contact_email: op.contact_email,
          contact_phone: op.contact_phone,
          credit_limit: op.credit_limit,
          admin_fee_percentage: op.admin_fee_percentage ?? 0,
          cuit: op.cuit ?? null,
          operationsCount: operations.length,
          totalCostByCurrency,
          paidAmountByCurrency,
          balanceByCurrency,
          nextPaymentDate: nextPayment?.due_date || null,
        }
      })
    } else {
      // ─── Modelo LEGACY: operations.operator_cost − payments PAID ────────
      operatorsWithStats = (data || []).map((op: any) => {
        const operations = (op.operations || []) as any[]
        const operationsCount = operations.length

        const totalCostByCurrency: Record<string, number> = {}
        const paidAmountByCurrency: Record<string, number> = {}

        for (const o of operations) {
          const opCur = o.currency || "ARS"
          totalCostByCurrency[opCur] = (totalCostByCurrency[opCur] || 0) + (Number(o.operator_cost) || 0)

          const payments = (o.payments || []) as any[]
          for (const p of payments) {
            if (p.direction === "EXPENSE" && p.status === "PAID") {
              const payCur = p.currency || opCur
              paidAmountByCurrency[payCur] = (paidAmountByCurrency[payCur] || 0) + (Number(p.amount) || 0)
            }
          }
        }

        const balanceByCurrency: Record<string, number> = {}
        const allCurrencies = Array.from(new Set([...Object.keys(totalCostByCurrency), ...Object.keys(paidAmountByCurrency)]))
        for (const cur of allCurrencies) {
          balanceByCurrency[cur] = (totalCostByCurrency[cur] || 0) - (paidAmountByCurrency[cur] || 0)
        }

        const nextPayment = operations
          .flatMap((o: any) => (o.payments || []) as any[])
          .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING")
          .sort((a: any, b: any) => new Date(a.date_due).getTime() - new Date(b.date_due).getTime())[0]

        return {
          id: op.id,
          name: op.name,
          contact_name: op.contact_name,
          contact_email: op.contact_email,
          contact_phone: op.contact_phone,
          credit_limit: op.credit_limit,
          admin_fee_percentage: op.admin_fee_percentage ?? 0,
          cuit: op.cuit ?? null,
          operationsCount,
          totalCostByCurrency,
          paidAmountByCurrency,
          balanceByCurrency,
          nextPaymentDate: nextPayment?.date_due || null,
        }
      })
    }

    return NextResponse.json({ operators: operatorsWithStats })
  } catch (error: any) {
    console.error("Error in GET /api/operators:", error)
    return NextResponse.json({ error: error.message || "Error al obtener operadores" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Permission check: verify the user can write to the operators module
    if (!canPerformAction(user, "operators", "write")) {
      return NextResponse.json({ error: "No tiene permisos para crear operadores" }, { status: 403 })
    }

    const body = await request.json()

    const { name, contact_name, contact_email, contact_phone, credit_limit, admin_fee_percentage } = body

    // Validations
    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    }

    if (!user.org_id) {
      return NextResponse.json({ error: "Tu usuario no tiene organización asociada" }, { status: 400 })
    }

    // Create operator (org-scoped)
    const { data: operator, error: createError } = await (supabase
      .from("operators") as any)
      .insert({
        org_id: user.org_id,
        name,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        credit_limit: credit_limit || null,
        admin_fee_percentage: typeof admin_fee_percentage === "number" ? admin_fee_percentage : 0,
      })
      .select()
      .single()

    if (createError || !operator) {
      console.error("Error creating operator:", createError)
      return NextResponse.json({ error: "Error al crear operador" }, { status: 400 })
    }

    // Invalidar caché de operadores
    revalidateTag(CACHE_TAGS.OPERATORS)

    return NextResponse.json({ success: true, operator })
  } catch (error) {
    console.error("Error in POST /api/operators:", error)
    return NextResponse.json({ error: "Error al crear operador" }, { status: 500 })
  }
}

