import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { loadReportCompany } from "@/lib/reports/report-company"
import {
  generateReferralSettlementPdf,
  type ReferralSettlementPdfLine,
} from "@/lib/pdf/referral-settlement-pdf"

export const dynamic = "force-dynamic"

/**
 * Comprobante de una liquidación al referidor (VIB-86).
 *
 * Es el papel que la agencia le pasa al referidor para que vea de dónde sale lo
 * que cobró: qué ventas, con qué ganancia y a qué porcentaje.
 *
 * Gate: `referrals:read`. Es el mismo permiso que ver los montos en pantalla —
 * un vendedor no puede descargarlo, porque no tiene que saber cuánto se lleva el
 * referidor (que es el pedido original de esta issue).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any)?.org_id as string | undefined

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "referrals", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: settlement } = await (supabase.from("referral_settlements") as any)
      .select(`
        *,
        referral_partners:referral_partner_id(id, name),
        financial_accounts:account_id(id, name, currency)
      `)
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (!settlement) {
      return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 })
    }

    const { data: commissions } = await (supabase.from("referral_commissions") as any)
      .select(`
        id, base_amount, percentage, amount,
        operations:operation_id(file_code, destination, departure_date),
        customers:customer_id(first_name, last_name)
      `)
      .eq("settlement_id", id)
      .eq("org_id", orgId)
      .order("date_calculated", { ascending: true })

    const lines: ReferralSettlementPdfLine[] = (commissions ?? []).map((c: any) => ({
      fileCode: c.operations?.file_code ?? null,
      destination: c.operations?.destination ?? null,
      customerName: c.customers
        ? `${c.customers.first_name ?? ""} ${c.customers.last_name ?? ""}`.trim() || null
        : null,
      departureDate: c.operations?.departure_date ?? null,
      baseAmount: Number(c.base_amount) || 0,
      percentage: Number(c.percentage) || 0,
      amount: Number(c.amount) || 0,
    }))

    const company = await loadReportCompany({ supabase, orgId })

    const pdf = generateReferralSettlementPdf({
      settlement: {
        id: settlement.id,
        partnerName: settlement.referral_partners?.name ?? "Referidor",
        currency: settlement.currency,
        amount: Number(settlement.amount) || 0,
        commissionsCount: Number(settlement.commissions_count) || lines.length,
        // Cae al nombre copiado al liquidar: la cuenta puede haberse borrado.
        accountName: settlement.financial_accounts?.name ?? settlement.account_name ?? "Cuenta",
        accountCurrency: settlement.account_currency,
        cashAmount: Number(settlement.cash_amount) || 0,
        exchangeRate: settlement.exchange_rate != null ? Number(settlement.exchange_rate) : null,
        periodFrom: settlement.period_from,
        periodTo: settlement.period_to,
        paidAt: settlement.paid_at,
        notes: settlement.notes,
        status: settlement.status,
        isRegularization: Boolean(settlement.is_regularization),
        lines,
      },
      company,
    })

    // Nombre de archivo seguro. Un referidor con nombre sin caracteres ASCII
    // dejaría el slug vacío, así que cae al genérico.
    const slug =
      (settlement.referral_partners?.name ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "referidor"
    const filename = `liquidacion-${slug}-${String(settlement.paid_at).slice(0, 10)}.pdf`

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Error in GET /api/referral-settlements/[id]/pdf:", error)
    return NextResponse.json(
      { error: "Error al generar el comprobante" },
      { status: 500 }
    )
  }
}
