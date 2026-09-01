/**
 * Los datos que hacen falta para plantear un ajuste de liquidación (VIB-174).
 *
 * Vive separado de la ruta porque lo usan los dos caminos: el GET que alimenta
 * el diálogo —para que el usuario vea el reparto ANTES de confirmar— y el POST
 * que lo registra. Si cada uno armara su contexto por su lado, la previsualización
 * podría mostrar un reparto distinto del que se termina escribiendo.
 */

import { getCommissionBaseConfig, type CommissionBaseConfig } from "@/lib/commissions/net-base"
import { KINDS_FUERA_DEL_PLAN_FILTER } from "@/lib/commissions/kinds"
import type {
  AdjustmentCommissionSource,
  AdjustmentReferralSource,
} from "@/lib/accounting/operator-cost-adjustment"

export interface OperatorDebtSnapshot {
  id: string
  operationId: string | null
  operatorId: string | null
  operatorName: string | null
  amount: number
  paidAmount: number
  currency: "ARS" | "USD"
  status: string
  dueDate: string | null
}

export interface OperatorCostAdjustmentContext {
  debt: OperatorDebtSnapshot
  agencyId: string | null
  operationDate: string | null
  operationStatus: string | null
  operationFileCode: string | null
  operationDestination: string | null
  commissions: AdjustmentCommissionSource[]
  referral: AdjustmentReferralSource | null
  baseConfig: CommissionBaseConfig | null
  splitWithSeller: boolean
}

export class AdjustmentContextError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/**
 * Si la agencia reparte el ajuste con el vendedor.
 *
 * Se filtra solo por agencia, igual que `getCommissionBaseConfig`: la fila de
 * `financial_settings` es por (org, agencia) y agregar el org acá haría que una
 * fila histórica con org nulo dejara de encontrarse y la perilla se leyera al
 * revés de como está configurada.
 *
 * Ante cualquier duda devuelve `true`, que es el default de la columna: un
 * error de lectura no debe cambiar en silencio a quién le toca la pérdida.
 */
export async function getAdjustmentSplitSetting(
  supabase: any,
  agencyId: string | null | undefined,
): Promise<boolean> {
  if (!agencyId) return true

  try {
    const { data, error } = await supabase
      .from("financial_settings")
      .select("operator_adjustment_split_with_seller")
      .eq("agency_id", agencyId)
      .maybeSingle()

    if (error || !data) return true
    return data.operator_adjustment_split_with_seller !== false
  } catch (err) {
    console.error("[VIB-174] No se pudo leer la perilla de reparto de ajustes:", err)
    return true
  }
}

export async function loadOperatorCostAdjustmentContext(
  supabase: any,
  operatorPaymentId: string,
  orgId: string,
): Promise<OperatorCostAdjustmentContext> {
  const { data: debtRow, error: debtError } = await supabase
    .from("operator_payments")
    .select(
      "id, operation_id, operator_id, amount, paid_amount, currency, status, due_date, operators:operator_id(name)",
    )
    .eq("id", operatorPaymentId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (debtError) {
    throw new AdjustmentContextError("Error al leer la deuda al operador", 500)
  }
  if (!debtRow) {
    throw new AdjustmentContextError("Deuda a operador no encontrada", 404)
  }

  const debt: OperatorDebtSnapshot = {
    id: debtRow.id,
    operationId: debtRow.operation_id ?? null,
    operatorId: debtRow.operator_id ?? null,
    operatorName: debtRow.operators?.name ?? null,
    amount: Number(debtRow.amount ?? 0),
    paidAmount: Number(debtRow.paid_amount ?? 0),
    currency: (debtRow.currency ?? "ARS") as "ARS" | "USD",
    status: debtRow.status ?? "PENDING",
    dueDate: debtRow.due_date ?? null,
  }

  let agencyId: string | null = null
  let operationDate: string | null = null
  let operationStatus: string | null = null
  let operationFileCode: string | null = null
  let operationDestination: string | null = null
  let commissions: AdjustmentCommissionSource[] = []
  let referral: AdjustmentReferralSource | null = null

  if (debt.operationId) {
    const { data: operation } = await supabase
      .from("operations")
      .select("id, agency_id, operation_date, status, file_code, destination")
      .eq("id", debt.operationId)
      .eq("org_id", orgId)
      .maybeSingle()

    agencyId = operation?.agency_id ?? null
    operationDate = operation?.operation_date ?? null
    operationStatus = operation?.status ?? null
    operationFileCode = operation?.file_code ?? null
    operationDestination = operation?.destination ?? null

    // Solo las comisiones que nacen del margen. El `percentage` de cada una es
    // el snapshot con el que se le liquidó a esa persona: es exactamente el que
    // tiene que usar el ajuste, no el que esté vigente hoy.
    const { data: commissionRows } = await supabase
      .from("commission_records")
      .select("seller_id, percentage, kind, status, amount, users:seller_id(first_name, last_name)")
      .eq("operation_id", debt.operationId)
      .not("kind", "in", KINDS_FUERA_DEL_PLAN_FILTER)

    commissions = (commissionRows || []).map((row: any) => ({
      sellerId: row.seller_id,
      percentage: row.percentage != null ? Number(row.percentage) : null,
      sellerName: row.users
        ? `${row.users.first_name ?? ""} ${row.users.last_name ?? ""}`.trim() || null
        : null,
      kind: row.kind ?? "SELLER",
    }))

    const { data: referralRow } = await supabase
      .from("referral_commissions")
      .select("percentage, basis, status")
      .eq("operation_id", debt.operationId)
      .maybeSingle()

    // Una comisión de referidor cancelada no se ajusta: ya no existe.
    if (referralRow && referralRow.status !== "CANCELLED") {
      referral = {
        percentage: referralRow.percentage != null ? Number(referralRow.percentage) : null,
        basis: (referralRow.basis ?? "MARGIN") as "MARGIN" | "SALE",
      }
    }
  }

  const [baseConfig, splitWithSeller] = await Promise.all([
    getCommissionBaseConfig(supabase, agencyId),
    getAdjustmentSplitSetting(supabase, agencyId),
  ])

  return {
    debt,
    agencyId,
    operationDate,
    operationStatus,
    operationFileCode,
    operationDestination,
    commissions,
    referral,
    baseConfig,
    splitWithSeller,
  }
}
