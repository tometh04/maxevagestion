import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { buildExchangeRateMap, getLatestExchangeRate, DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"

export const dynamic = "force-dynamic"

/**
 * GET /api/accounting/payments-semaphore
 *
 * Devuelve conteos y montos de cobros pendientes a clientes y pagos
 * pendientes a operadores, agrupados por urgencia:
 *   - overdue: vencidos (date_due/due_date < hoy)
 *   - near:    próximos a vencer (hoy <= date <= hoy+30 días)
 *   - ok:      sin urgencia (date > hoy+30 o sin fecha)
 *
 * Usado por el widget semáforo del dashboard (VIB-37).
 * Nota: es una vista gerencial — muestra el total del org/agencia,
 * no filtra por vendedor individual.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const agencyIdFilter = searchParams.get("agencyId")

    const supabase = await createServerClient()
    const orgId = (user as any).org_id as string

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split("T")[0]

    const nearDeadline = new Date(today)
    nearDeadline.setDate(nearDeadline.getDate() + 30)
    const nearDeadlineStr = nearDeadline.toISOString().split("T")[0]

    // Agencias del user para scoping
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Si el usuario no tiene agencias asignadas y no filtra explícitamente,
    // devolver vacío — no exponer datos de todo el org a un user sin scope.
    if (!agencyIdFilter && agencyIds.length === 0) {
      return NextResponse.json(
        {
          customerPayments: { overdue: { count: 0, totalUsd: 0 }, near: { count: 0, totalUsd: 0 }, ok: { count: 0, totalUsd: 0 } },
          operatorPayments: { overdue: { count: 0, totalUsd: 0 }, near: { count: 0, totalUsd: 0 }, ok: { count: 0, totalUsd: 0 } },
        },
        { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } }
      )
    }

    // ── Clasificación por urgencia ───────────────────────────────────────────
    type Bucket = { count: number; totalUsd: number }
    const empty = (): { overdue: Bucket; near: Bucket; ok: Bucket } => ({
      overdue: { count: 0, totalUsd: 0 },
      near: { count: 0, totalUsd: 0 },
      ok: { count: 0, totalUsd: 0 },
    })

    // ── Cobros pendientes a clientes ─────────────────────────────────────────
    // La deuda del cliente es IMPLÍCITA: sale_amount_total − Σ(pagos INCOME /
    // payer_type=CUSTOMER / status=PAID). NO existe como filas payments con
    // status=PENDING — el sistema solo materializa los cobros reales como PAID.
    // Por eso el semáforo daba SIEMPRE 0 en "Cobros a Clientes" (bug reportado
    // por VICO 2026-06-29): filtraba payments status=PENDING que nunca existen.
    // Se computa por operación igual que el reporte de deudores
    // (/api/accounting/debts-sales), usando departure_date como vencimiento del
    // cobro (hay que cobrar antes del viaje). Se convierte a USD para el total.
    // Servicios adicionales: si la flag está ON, una op con venta base 0 puede
    // tener servicios impagos → deuda. Por eso NO filtramos .gt("sale_amount_total",0)
    // cuando la flag está ON (esas ops quedarían fuera del fetch). Con flag OFF se
    // conserva el filtro por perf.
    const includeServices = await getOrgFeatureFlag(
      supabase, orgId, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
    )

    let opsQuery = (supabase.from("operations") as any)
      .select("id, sale_amount_total, sale_currency, currency, departure_date, created_at, agency_id")
      .eq("org_id", orgId)
      .neq("status", "CANCELLED")
    if (!includeServices) {
      opsQuery = opsQuery.gt("sale_amount_total", 0)
    }

    if (agencyIdFilter && agencyIdFilter !== "ALL") {
      opsQuery = opsQuery.eq("agency_id", agencyIdFilter)
    } else {
      opsQuery = opsQuery.in("agency_id", agencyIds)
    }

    const { data: ops } = await opsQuery
    const opList = (ops || []) as any[]

    const serviceExtras = includeServices && opList.length > 0
      ? await getServiceExtrasByOperation(supabase, opList, orgId)
      : {}

    // Pagos PAID del cliente por operación (chunked: .in() revienta URL con >300 UUIDs).
    // Deuda NETA: cobros INCOME (sign +1) − devoluciones EXPENSE (sign -1). Una
    // devolución reduce lo aportado neto por el cliente → sube su deuda. Por eso
    // ya NO filtramos direction=INCOME: traemos ambas y aplicamos el signo.
    type RawPayment = { amount: number; currency: string; exchange_rate: number | null; amount_usd: number | null; sign: number }
    const paidByOperation: Record<string, RawPayment[]> = {}
    const opIds = opList.map((o) => o.id)
    const chunkSize = 200
    for (let i = 0; i < opIds.length; i += chunkSize) {
      const chunk = opIds.slice(i, i + chunkSize)
      const { data: payments } = await (supabase.from("payments") as any)
        .select("operation_id, amount, amount_usd, currency, exchange_rate, status, direction, payer_type")
        .in("operation_id", chunk)
        .eq("org_id", orgId)
        .eq("payer_type", "CUSTOMER")
      for (const p of payments || []) {
        if (p.status !== "PAID") continue
        if (p.direction !== "INCOME" && p.direction !== "EXPENSE") continue
        ;(paidByOperation[p.operation_id] ||= []).push({
          amount: Number(p.amount) || 0,
          currency: p.currency || "ARS",
          exchange_rate: p.exchange_rate != null ? Number(p.exchange_rate) : null,
          amount_usd: p.amount_usd != null ? Number(p.amount_usd) : null,
          sign: p.direction === "EXPENSE" ? -1 : 1,
        })
      }
    }

    // Tasa de cambio para convertir deudas ARS a USD (map por fecha + fallback).
    const latestRate = (await getLatestExchangeRate(supabase)) || DEFAULT_USD_ARS_FALLBACK_RATE
    const arsDates = opList
      .filter((o) => (o.sale_currency || o.currency || "USD") === "ARS")
      .map((o) => o.departure_date || o.created_at)
    const getRate = await buildExchangeRateMap(supabase, arsDates)

    const customerResult = empty()
    for (const op of opList) {
      const saleCurrency = op.sale_currency || op.currency || "USD"
      const saleAmount = (Number(op.sale_amount_total) || 0) + ((serviceExtras as any)[op.id]?.saleExtra || 0)
      const rateForOp = getRate(op.departure_date || op.created_at) || latestRate

      // Netear pagos en la moneda de la venta y recién después convertir a USD.
      // sign resta las devoluciones (EXPENSE) del total aportado por el cliente.
      let paidInSaleCurrency = 0
      for (const p of paidByOperation[op.id] || []) {
        let converted: number
        if (p.currency === saleCurrency) {
          converted = p.amount
        } else if (saleCurrency === "ARS" && p.currency === "USD") {
          converted = p.amount * (p.exchange_rate || rateForOp)
        } else if (saleCurrency === "USD" && p.currency === "ARS") {
          converted = p.amount_usd != null ? p.amount_usd : p.amount / (p.exchange_rate || rateForOp)
        } else {
          converted = p.amount
        }
        paidInSaleCurrency += p.sign * converted
      }

      const debtInSaleCurrency = Math.max(0, saleAmount - paidInSaleCurrency)
      if (debtInSaleCurrency < 0.01) continue
      const debtUsd = saleCurrency === "ARS" ? debtInSaleCurrency / rateForOp : debtInSaleCurrency

      const dueDate = op.departure_date as string | null
      let bucket: "overdue" | "near" | "ok" = "ok"
      if (dueDate) {
        if (dueDate < todayStr) bucket = "overdue"
        else if (dueDate <= nearDeadlineStr) bucket = "near"
      }
      customerResult[bucket].count++
      customerResult[bucket].totalUsd += debtUsd
    }

    // ── Pagos pendientes a operadores (operator_payments) ───────────────────
    // operator_payments no tiene agency_id propio — la agencia viene de la
    // operación relacionada. Filtramos por org_id en SQL y por agency en JS.
    const { data: operatorPayments } = await (supabase.from("operator_payments") as any)
      .select("id, amount, paid_amount, currency, due_date, status, operations!operation_id(agency_id)")
      .eq("org_id", orgId)
      .in("status", ["PENDING", "OVERDUE"])

    const operatorResult = empty()
    for (const p of operatorPayments || []) {
      // Filtrar por agencia en JS (operator_payments no tiene agency_id directo)
      const opAgencyId = (p.operations as any)?.agency_id as string | null
      if (agencyIdFilter && agencyIdFilter !== "ALL") {
        if (opAgencyId !== agencyIdFilter) continue
      } else if (agencyIds.length > 0 && opAgencyId && !agencyIds.includes(opAgencyId)) {
        continue
      }

      const pending = Math.max(0, Number(p.amount || 0) - Number(p.paid_amount || 0))
      if (pending < 0.01) continue // ignorar deudas ya cubiertas
      const amtUsd = p.currency === "USD" ? pending : 0
      const dueDate = p.due_date as string | null
      let bucket: "overdue" | "near" | "ok" = "ok"
      // status=OVERDUE siempre es rojo independientemente de due_date
      if (p.status === "OVERDUE" || (dueDate && dueDate < todayStr)) {
        bucket = "overdue"
      } else if (dueDate && dueDate <= nearDeadlineStr) {
        bucket = "near"
      }
      operatorResult[bucket].count++
      operatorResult[bucket].totalUsd += amtUsd
    }

    return NextResponse.json(
      { customerPayments: customerResult, operatorPayments: operatorResult },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    )
  } catch (error: any) {
    console.error("[payments-semaphore] Error:", error)
    return NextResponse.json({ error: error?.message || "Error al cargar semáforo" }, { status: 500 })
  }
}
