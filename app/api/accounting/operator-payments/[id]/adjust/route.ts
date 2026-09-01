/**
 * Ajuste de liquidación de operador (VIB-174).
 *
 *   GET  → el contexto y la previsualización del reparto, para el diálogo.
 *   POST → lo registra.
 *
 * Los dos arman el contexto con la MISMA función y calculan el reparto con la
 * MISMA función pura, así lo que el usuario ve antes de confirmar es lo que se
 * escribe. El servidor nunca acepta el reparto que venga del cliente: solo el
 * costo real, el motivo y la fecha de imputación.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import { getExchangeRate } from "@/lib/accounting/exchange-rates"
import { todayInArgentina } from "@/lib/utils/date-only"
import {
  planOperatorCostAdjustment,
  toSellerSharesPayload,
} from "@/lib/accounting/operator-cost-adjustment"
import {
  AdjustmentContextError,
  loadOperatorCostAdjustmentContext,
} from "@/lib/accounting/operator-cost-adjustment-context"

const bodySchema = z.object({
  actual_amount: z.number().finite().nonnegative(),
  reason: z.string().trim().min(1, "El motivo del ajuste es obligatorio").max(1000),
  accrual_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (esperado YYYY-MM-DD)")
    .optional(),
  /** Lo que el cliente vio al abrir el diálogo. Si cambió, se rechaza. */
  expected_amount: z.number().finite().optional(),
  expected_paid_amount: z.number().finite().optional(),
  /** Cuando el ajuste nace de un pago que resultó ser la liquidación final. */
  payment_id: z.string().uuid().optional(),
  source: z.enum(["MANUAL", "OPERATOR_PAYMENT"]).optional(),
})

function errorResponse(error: unknown) {
  if (error instanceof AdjustmentContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  const message = (error as any)?.message || "Error al procesar el ajuste"
  console.error("[VIB-174] Error en el ajuste de liquidación:", error)
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any).org_id

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "accounting", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const context = await loadOperatorCostAdjustmentContext(supabase, id, orgId)

    // Los ajustes que ya tiene esta deuda, para que el diálogo muestre el
    // historial: si alguien ya la corrigió, hay que verlo antes de corregirla
    // de nuevo.
    // `as any` sobre el cliente hasta que se regeneren los tipos con la tabla nueva.
    const { data: previous } = await (supabase as any)
      .from("operator_cost_adjustments")
      .select(
        "id, estimated_amount, actual_amount, delta_amount, currency, accrual_date, reason, reversed_at, created_at",
      )
      .eq("operator_payment_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    return NextResponse.json({
      debt: context.debt,
      operation: {
        id: context.debt.operationId,
        date: context.operationDate,
        status: context.operationStatus,
        fileCode: context.operationFileCode,
        destination: context.operationDestination,
      },
      commissions: context.commissions,
      referral: context.referral,
      splitWithSeller: context.splitWithSeller,
      ivaBaseEnabled: context.baseConfig?.enabled === true,
      adjustments: previous || [],
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any).org_id

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "accounting", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Datos inválidos" },
        { status: 400 },
      )
    }
    const body = parsed.data

    const context = await loadOperatorCostAdjustmentContext(supabase, id, orgId)

    if (context.operationStatus === "CANCELLED") {
      return NextResponse.json(
        { error: "No se puede ajustar la deuda de una operación cancelada" },
        { status: 409 },
      )
    }

    const accrualDate = body.accrual_date || todayInArgentina()

    const plan = planOperatorCostAdjustment({
      currentDebtAmount: context.debt.amount,
      paidAmount: context.debt.paidAmount,
      actualAmount: body.actual_amount,
      operationDate: context.operationDate,
      baseConfig: context.baseConfig,
      splitWithSeller: context.splitWithSeller,
      commissions: context.commissions,
      referral: context.referral,
    })

    if (!plan.hasAdjustment) {
      return NextResponse.json(
        { error: "El costo real coincide con la deuda registrada: no hay ajuste que hacer" },
        { status: 400 },
      )
    }

    if (plan.warnings.some((w) => w.code === "below_paid_amount")) {
      return NextResponse.json(
        {
          error: `El costo real (${body.actual_amount}) es menor que lo que ya se le pagó al operador (${context.debt.paidAmount}). Revertí el pago antes de ajustar.`,
        },
        { status: 409 },
      )
    }

    // Una deuda en dólares se asienta en pesos con una cotización real. Si no
    // hay ninguna cargada, se corta: valuar con un número inventado ensucia el
    // mayor de forma silenciosa y después nadie sabe de dónde salió.
    let exchangeRate: number | null = null
    if (context.debt.currency === "USD") {
      exchangeRate = await getExchangeRate(supabase, accrualDate)
      if (!exchangeRate || exchangeRate <= 0) {
        return NextResponse.json(
          {
            error:
              "No hay cotización del dólar cargada para esa fecha. Cargala en Contabilidad antes de registrar el ajuste.",
          },
          { status: 409 },
        )
      }
    }

    const { data, error } = await (supabase.rpc as any)("register_operator_cost_adjustment", {
      p_operator_payment_id: id,
      p_org_id: orgId,
      p_actual_amount: body.actual_amount,
      p_reason: body.reason,
      p_accrual_date: accrualDate,
      p_expected_amount: body.expected_amount ?? context.debt.amount,
      p_expected_paid_amount: body.expected_paid_amount ?? context.debt.paidAmount,
      p_seller_shares: toSellerSharesPayload(plan),
      p_referrer_share: plan.referrerShare,
      p_agency_share: plan.agencyShare,
      p_exchange_rate: exchangeRate,
      p_source: body.source ?? "MANUAL",
      p_payment_id: body.payment_id ?? null,
      p_actor: (user as any).id,
    })

    if (error) {
      // Los mensajes de la función están escritos para que los lea quien
      // registra el ajuste, así que se devuelven tal cual.
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    return NextResponse.json({
      ...data,
      plan: {
        delta: plan.delta,
        result: plan.result,
        direction: plan.direction,
        sellerShares: plan.sellerShares,
        referrerShare: plan.referrerShare,
        agencyShare: plan.agencyShare,
        warnings: plan.warnings,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
