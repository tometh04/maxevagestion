import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import {
  createLedgerMovement,
  validateSufficientBalance,
} from "@/lib/accounting/ledger"
import { getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { todayInArgentina } from "@/lib/utils/date-only"
import {
  buildSettlementConcept,
  resolveSettlementCash,
  validateSettlementSelection,
  type SettlementCurrency,
} from "@/lib/referrals/settlement"

export const dynamic = "force-dynamic"

/**
 * Liquidación de comisiones al referidor (VIB-86).
 *
 * Antes, "pagar" una comisión de referido sólo cambiaba `status` a PAID: la
 * plata no salía de ninguna cuenta y el saldo de caja quedaba inflado. Acá se
 * paga de verdad: una liquidación agrupa N comisiones de un referidor en una
 * moneda, descuenta el saldo de la cuenta elegida vía ledger_movement y queda
 * respaldada por un comprobante en PDF.
 *
 * Permisos: `referrals:read` (ver cuánto se le paga a un referidor) +
 * `cash:write` (sacar plata de una cuenta). La intersección da SUPER_ADMIN,
 * ORG_OWNER, ADMIN y CONTABLE — que es lo que el diseño del módulo decía desde
 * el principio ("CONTABLE liquida las comisiones al referidor") pero el gate
 * viejo (`commissions:write`, que CONTABLE no tiene) impedía.
 */

interface SettlementBody {
  commissionIds?: unknown
  financial_account_id?: unknown
  exchange_rate?: unknown
  paid_at?: unknown
  notes?: unknown
  /**
   * Regularizar comisiones marcadas como pagadas con el flujo viejo (PAID sin
   * liquidación): registra la salida de caja que faltó, sin volver a "pagarlas".
   */
  regularize?: unknown
}

function puedeLiquidar(user: any, matrix: any): boolean {
  return (
    canPerformAction(user, "referrals", "read", matrix ?? undefined) &&
    canPerformAction(user, "cash", "write", matrix ?? undefined)
  )
}

export async function GET(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!(user as any)?.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "referrals", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const partnerId = searchParams.get("partnerId")

    let query = (supabase.from("referral_settlements") as any)
      .select(`
        *,
        referral_partners:referral_partner_id(id, name),
        financial_accounts:account_id(id, name, currency)
      `)
      .eq("org_id", (user as any).org_id)
      .order("paid_at", { ascending: false })

    if (partnerId && partnerId !== "ALL") {
      query = query.eq("referral_partner_id", partnerId)
    }

    const { data, error } = await query
    if (error) {
      console.error("Error listando referral_settlements:", error)
      return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }

    return NextResponse.json({ settlements: data ?? [] })
  } catch (error) {
    console.error("Error in GET /api/referral-settlements:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any)?.org_id as string | undefined

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!puedeLiquidar(user, matrix)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = (await request.json()) as SettlementBody
    const commissionIds = Array.isArray(body.commissionIds)
      ? Array.from(new Set(body.commissionIds.filter((id): id is string => typeof id === "string")))
      : []
    const accountId = typeof body.financial_account_id === "string" ? body.financial_account_id : ""
    const regularize = body.regularize === true

    if (commissionIds.length === 0) {
      return NextResponse.json(
        { error: "Seleccioná al menos una comisión para liquidar" },
        { status: 400 }
      )
    }
    if (!accountId) {
      return NextResponse.json(
        { error: "Elegí la cuenta desde la que sale el pago" },
        { status: 400 }
      )
    }

    // ── 1. Comisiones, scopeadas por org (no confiar sólo en RLS).
    const { data: commissions, error: comError } = await (supabase.from("referral_commissions") as any)
      .select("id, referral_partner_id, agency_id, currency, amount, status, settlement_id, date_calculated")
      .eq("org_id", orgId)
      .in("id", commissionIds)

    if (comError) {
      console.error("Error leyendo referral_commissions:", comError)
      return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
    if (!commissions || commissions.length !== commissionIds.length) {
      return NextResponse.json(
        { error: "Alguna de las comisiones no existe o no pertenece a tu organización" },
        { status: 404 }
      )
    }

    const seleccion = validateSettlementSelection(commissions as any, { regularize })
    if (!seleccion.ok || !seleccion.currency || !seleccion.partnerId) {
      return NextResponse.json({ error: seleccion.error ?? "Selección inválida" }, { status: 400 })
    }

    // ── 2. Referidor y cuenta, ambos del tenant.
    const { data: partner } = await (supabase.from("referral_partners") as any)
      .select("id, name, agency_id")
      .eq("id", seleccion.partnerId)
      .eq("org_id", orgId)
      .maybeSingle()

    if (!partner) {
      return NextResponse.json({ error: "Referidor no encontrado" }, { status: 404 })
    }

    const { data: account } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active")
      .eq("id", accountId)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle()

    if (!account) {
      return NextResponse.json(
        { error: "Cuenta financiera no encontrada o inactiva" },
        { status: 404 }
      )
    }

    const accountCurrency = account.currency as SettlementCurrency
    const commissionCurrency = seleccion.currency

    // ── 3. Cuánta plata sale de la cuenta.
    let exchangeRate: number | null =
      body.exchange_rate != null && body.exchange_rate !== ""
        ? Number(body.exchange_rate)
        : null

    // Fecha del pago como "YYYY-MM-DD", sin convertirla a Date.
    //
    // `new Date("2026-08-12")` se ancla a UTC y en Argentina (UTC-3) cae el día
    // anterior, así que el egreso aparecería en el día equivocado. Se pasa el
    // string tal cual —igual que `/api/commissions/pay`—, que además es lo que
    // esperan los filtros por rango del ledger (`movement_date >= 'F T00:00:00'`).
    const paidAt =
      typeof body.paid_at === "string" && body.paid_at.trim()
        ? body.paid_at.trim().slice(0, 10)
        : todayInArgentina()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      return NextResponse.json({ error: "Fecha de pago inválida" }, { status: 400 })
    }

    const necesitaTC = commissionCurrency === "USD" || accountCurrency === "USD"
    if (necesitaTC && (!exchangeRate || exchangeRate <= 0)) {
      // Mismo criterio que el pago de comisión al vendedor: si el usuario no lo
      // ingresa, se resuelve con la cotización vigente en vez de fallar.
      const rateResult = await getExchangeRateWithFallback(supabase, paidAt, "referral-settlement")
      exchangeRate = rateResult.rate
    }

    const cash = resolveSettlementCash({
      commissionCurrency,
      accountCurrency,
      amount: seleccion.amount,
      exchangeRate,
    })
    if (!cash.ok) {
      return NextResponse.json({ error: cash.error ?? "No se pudo calcular el pago" }, { status: 400 })
    }

    // ── 4. Saldo suficiente: nunca dejar la cuenta en negativo.
    const balance = await validateSufficientBalance(
      accountId,
      cash.cashAmount,
      accountCurrency,
      supabase
    )
    if (!balance.valid) {
      return NextResponse.json(
        { error: balance.error || "Saldo insuficiente en la cuenta para realizar el pago" },
        { status: 400 }
      )
    }

    // Agencia: sólo si todas las comisiones comparten la misma; si no, queda
    // a nivel org (una liquidación puede cubrir ventas de varias agencias).
    const agencyIdsEnSeleccion = new Set(
      (commissions as any[]).map((c) => c.agency_id ?? null)
    )
    const agencyId =
      agencyIdsEnSeleccion.size === 1
        ? Array.from(agencyIdsEnSeleccion)[0] ?? partner.agency_id ?? null
        : null

    const concept = buildSettlementConcept({
      partnerName: partner.name,
      commissionsCount: commissions.length,
      periodFrom: seleccion.periodFrom,
      periodTo: seleccion.periodTo,
    })

    // ── 5. Crear la liquidación. Orden deliberado: fila → imputación con CAS →
    // movimiento de ledger. Si algo falla después de imputar, se compensa: es
    // preferible dejar todo como estaba a dejar comisiones pagadas sin egreso
    // (que es exactamente el bug que este endpoint viene a arreglar).
    const nowIso = new Date().toISOString()
    const { data: settlement, error: settlementError } = await (supabase
      .from("referral_settlements") as any)
      .insert({
        org_id: orgId,
        agency_id: agencyId,
        referral_partner_id: partner.id,
        currency: commissionCurrency,
        amount: seleccion.amount,
        commissions_count: commissions.length,
        account_id: accountId,
        account_name: account.name,
        account_currency: accountCurrency,
        cash_amount: cash.cashAmount,
        exchange_rate: cash.exchangeRate,
        period_from: seleccion.periodFrom,
        period_to: seleccion.periodTo,
        paid_at: paidAt,
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        is_regularization: regularize,
        status: "PAID",
        created_by: user.id,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .single()

    if (settlementError || !settlement) {
      console.error("Error creando referral_settlement:", settlementError)
      return NextResponse.json({ error: "Error al crear la liquidación" }, { status: 500 })
    }

    // Imputación con CAS: sólo toma las comisiones que siguen elegibles. Si otro
    // usuario liquidó alguna en el medio, no entra y abortamos entero.
    const { data: claimed, error: claimError } = await (supabase
      .from("referral_commissions") as any)
      .update({
        settlement_id: settlement.id,
        status: "PAID",
        date_paid: paidAt,
        updated_at: nowIso,
      })
      .eq("org_id", orgId)
      .in("id", commissionIds)
      .eq("status", regularize ? "PAID" : "PENDING")
      .is("settlement_id", null)
      .select("id, amount")

    const claimedIds: string[] = (claimed ?? []).map((c: any) => c.id)

    if (claimError || claimedIds.length !== commissionIds.length) {
      console.error("Error imputando comisiones a la liquidación:", {
        claimError,
        pedidas: commissionIds.length,
        imputadas: claimedIds.length,
      })
      await compensar(supabase, orgId, settlement.id, claimedIds, regularize)
      return NextResponse.json(
        {
          error:
            "Alguna de las comisiones cambió de estado mientras se liquidaba. Refrescá la pantalla y volvé a intentar.",
        },
        { status: 409 }
      )
    }

    // amount_paid es por fila (cada comisión se liquida por su total), así que
    // no entra en el UPDATE batch de arriba.
    for (const row of claimed as any[]) {
      await (supabase.from("referral_commissions") as any)
        .update({ amount_paid: Number(row.amount) || 0 })
        .eq("id", row.id)
        .eq("org_id", orgId)
    }

    // ── 6. La plata sale de la cuenta.
    //
    // operation_id NULL a propósito: la liquidación cubre muchas ventas, y
    // además createLedgerMovement() con type=COMMISSION + operation_id dispara
    // markCommissionsAsPaidIfLedgerExists(), que marcaría como pagada la
    // comisión del VENDEDOR de esa operación. seller_id también va NULL: el
    // referidor es una entidad externa, no un usuario del tenant.
    let ledgerMovementId: string
    try {
      const created = await createLedgerMovement(
        {
          operation_id: null,
          lead_id: null,
          type: "COMMISSION",
          concept,
          currency: accountCurrency,
          amount_original: cash.cashAmount,
          exchange_rate: cash.exchangeRate,
          amount_ars_equivalent: cash.amountARS,
          method: "CASH",
          account_id: accountId,
          seller_id: null,
          operator_id: null,
          receipt_number: null,
          notes: `Liquidación de referido ${settlement.id}`,
          created_by: user.id,
          movement_date: paidAt,
          org_id: orgId,
        },
        supabase
      )
      ledgerMovementId = created.id
    } catch (ledgerError) {
      console.error("Error creando ledger_movement de liquidación de referido:", ledgerError)
      await compensar(supabase, orgId, settlement.id, claimedIds, regularize)
      return NextResponse.json(
        { error: "No se pudo registrar la salida de caja. No se liquidó ninguna comisión." },
        { status: 500 }
      )
    }

    const { data: updatedSettlement } = await (supabase.from("referral_settlements") as any)
      .update({ ledger_movement_id: ledgerMovementId, updated_at: new Date().toISOString() })
      .eq("id", settlement.id)
      .eq("org_id", orgId)
      .select()
      .single()

    try {
      await (supabase.rpc as any)("log_audit_action", {
        p_user_id: user.id,
        p_action: regularize ? "REFERRAL_SETTLEMENT_REGULARIZED" : "REFERRAL_SETTLEMENT_PAID",
        p_entity_type: "referral_settlement",
        p_entity_id: settlement.id,
        p_details: {
          partner_id: partner.id,
          amount: seleccion.amount,
          currency: commissionCurrency,
          cash_amount: cash.cashAmount,
          account_currency: accountCurrency,
          commissions: claimedIds.length,
        },
      })
    } catch (auditError) {
      console.warn("Error logging audit action (referral settlement):", auditError)
    }

    return NextResponse.json({
      success: true,
      settlement: updatedSettlement ?? { ...settlement, ledger_movement_id: ledgerMovementId },
      ledgerMovementId,
    })
  } catch (error) {
    console.error("Error in POST /api/referral-settlements:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

/**
 * Deshace una liquidación a medio crear: devuelve las comisiones a su estado
 * anterior y borra la fila. Sin esto quedarían comisiones marcadas como pagadas
 * sin movimiento de caja, o sea el mismo bug que estamos arreglando.
 */
async function compensar(
  supabase: any,
  orgId: string,
  settlementId: string,
  claimedIds: string[],
  regularize: boolean
): Promise<void> {
  try {
    if (claimedIds.length > 0) {
      // Al regularizar, la comisión ya estaba PAID antes de tocarla: sólo se
      // desimputa. En el flujo normal vuelve a PENDING y se limpia la liquidación.
      const rollback: Record<string, any> = {
        settlement_id: null,
        status: regularize ? "PAID" : "PENDING",
        updated_at: new Date().toISOString(),
      }
      if (!regularize) {
        rollback.date_paid = null
        rollback.amount_paid = 0
      }

      await supabase
        .from("referral_commissions")
        .update(rollback)
        .eq("org_id", orgId)
        .in("id", claimedIds)
    }
    await supabase.from("referral_settlements").delete().eq("id", settlementId).eq("org_id", orgId)
  } catch (err) {
    console.error("[Referrals] Error compensando liquidación fallida:", {
      settlementId,
      claimedIds,
      err,
    })
  }
}
