import { NextRequest, NextResponse } from "next/server"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { getCurrentUser } from "@/lib/auth"
import {
  getCustomerIncomeReferenceCurrency,
  normalizeSupportedCurrency,
} from "@/lib/payments/customer-income-fx"
import {
  buildReceiptPaymentSummary,
  filterReceiptPaymentsByScope,
  getReceiptPaymentAmountInCurrency,
  getReceiptScope,
  type ReceiptPaymentRecord,
} from "@/lib/receipts/receipt-data"
import { buildReceiptFileName } from "@/lib/receipts/receipt-file"
import { buildReceiptPassengerDetails } from "@/lib/receipts/receipt-passengers"
import { createServerClient } from "@/lib/supabase/server"

const SERVICE_LABELS: Record<string, string> = {
  HOTEL: "Hotel",
  FLIGHT: "Vuelo / Aéreo",
  TRANSFER: "Traslado / Transfer",
  EXCURSION: "Excursión",
  ASSISTANCE: "Asistencia",
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visa",
}

function parseDateValue(value: string): Date {
  return new Date(value.includes("T") ? value : `${value}T12:00:00`)
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

// API para obtener datos del recibo - genera PDF en el cliente
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get("paymentId")

    if (!paymentId) {
      return NextResponse.json({ error: "ID de pago requerido" }, { status: 400 })
    }

    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const { data: payment, error } = await (supabase.from("payments") as any)
      .select(`
        id,
        amount,
        amount_usd,
        currency,
        exchange_rate,
        reference,
        date_paid,
        date_due,
        operation_id,
        operation_service_id,
        operations:operation_id (
          id,
          seller_id,
          leads:lead_id (
            contact_name
          ),
          file_code,
          destination,
          origin,
          departure_date,
          return_date,
          sale_amount_total,
          sale_currency,
          currency,
          adults,
          children,
          infants,
          type,
          agencies:agency_id (id, name, city),
          operators:operator_id (id, name)
        ),
        operation_services:operation_service_id (
          id,
          service_type,
          description,
          sale_amount,
          sale_currency,
          operators:operator_id (id, name)
        )
      `)
      .eq("id", paymentId)
      .single()

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json(
        { error: "Error en base de datos: " + error.message, paymentId },
        { status: 500 }
      )
    }

    if (!payment) {
      return NextResponse.json({ error: "Pago no encontrado", paymentId }, { status: 404 })
    }

    const receiptScope = getReceiptScope(payment.operation_service_id)
    const operation = firstRelation((payment as any).operations) as any
    const service = firstRelation((payment as any).operation_services) as any

    const lead = firstRelation(operation?.leads) as any
    const agency = firstRelation(operation?.agencies) as any
    const operator = firstRelation(operation?.operators) as any
    const serviceOperator = firstRelation(service?.operators) as any

    if (receiptScope === "SERVICE" && !service?.id) {
      return NextResponse.json(
        { error: "No se encontró el servicio vinculado al pago", paymentId },
        { status: 404 }
      )
    }

    let customerName = "Cliente"
    let customerLastName = ""
    let customerAddress = ""
    let customerCity = ""
    let passengerNamesText = "Cliente"

    if (user.role === "SELLER" && operation?.seller_id !== user.id) {
      return NextResponse.json({ error: "No autorizado para ver este recibo" }, { status: 403 })
    }

    if (operation?.id) {
      const { data: operationCustomers } = await (supabase.from("operation_customers") as any)
        .select(`
          role,
          customers:customer_id (first_name, last_name)
        `)
        .eq("operation_id", operation.id)

      const passengerDetails = buildReceiptPassengerDetails({
        operationCustomers,
        leadContactName: lead?.contact_name || "",
      })

      customerName = passengerDetails.customerName
      customerLastName = passengerDetails.customerLastName
      customerAddress = passengerDetails.customerAddress
      customerCity = passengerDetails.customerCity
      passengerNamesText = passengerDetails.passengerNamesText
    }

    let totalOperacion = 0
    let totalPagado = 0
    let saldoRestante = 0
    let paymentHistory: Array<{
      id: string
      amount: number
      currency: string
      datePaid: string | null
      reference: string
      amountInReceiptCurrency: number
    }> = []

    const receiptCurrency = getCustomerIncomeReferenceCurrency({
      operation,
      service: service || null,
    })

    if (operation?.id) {
      const { data: paymentsData } = await (supabase.from("payments") as any)
        .select(
          "id, amount, amount_usd, currency, exchange_rate, date_paid, status, payer_type, direction, reference, operation_service_id"
        )
        .eq("operation_id", operation.id)
        .eq("payer_type", "CUSTOMER")
        .eq("direction", "INCOME")
        .eq("status", "PAID")
        .order("date_paid", { ascending: true })

      const scopedPayments = filterReceiptPaymentsByScope(
        ((paymentsData || []) as ReceiptPaymentRecord[]),
        payment.operation_service_id || null
      )

      totalOperacion =
        receiptScope === "SERVICE"
          ? Number(service?.sale_amount) || 0
          : Number(operation.sale_amount_total) || 0

      const summary = buildReceiptPaymentSummary({
        payments: scopedPayments,
        receiptCurrency,
        totalAmount: totalOperacion,
      })

      totalOperacion = summary.totalOperacion
      totalPagado = summary.totalPagado
      saldoRestante = summary.saldoRestante
      paymentHistory = summary.paymentHistory.map((historyPayment) => ({
        id: historyPayment.id,
        amount: historyPayment.amount,
        currency: historyPayment.currency,
        datePaid: historyPayment.datePaid,
        reference: historyPayment.reference,
        amountInReceiptCurrency: historyPayment.amountInReceiptCurrency,
      }))
    }

    // 🔴 Fix cross-tenant leak (2026-05-16, Tomi): antes este SELECT no filtraba
    // por org_id. Resultado: cualquier tenant emitía recibos con company_name,
    // address, CUIT, etc. del PRIMER tenant que hubiera cargado esas keys (Lozada).
    // Ej: VICO emitía recibos firmados "Lozada Rosario · Corrientes 631 · CUIT 20-...".
    // Ahora scopeamos por user.org_id como corresponde en multi-tenant.
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { data: orgSettingsData } = await (supabase.from("organization_settings") as any)
      .select("key, value")
      .eq("org_id", user.org_id)
    const getOrg = (key: string, fallback: string) =>
      orgSettingsData?.find((setting: any) => setting.key === key)?.value || fallback

    const companyName = getOrg("company_name", agency?.name || "Mi Empresa")
    const companyAddress = getOrg("address", getOrg("company_address", ""))
    const companyPhone = getOrg("phone", getOrg("company_phone", ""))
    const companyEmail = getOrg("email", getOrg("company_email", ""))
    const companyLegajo = getOrg("legajo", getOrg("company_legajo", ""))
    const companyTaxId = getOrg("tax_id", getOrg("company_tax_id", ""))
    const brandColor = getOrg("brand_color", "#f97316")
    const brandLogo = getOrg("brand_logo", "")
    const pdfTermsText = getOrg("pdf_terms_text", "")
    const agencyCity = agency?.city || getOrg("city", "Rosario")
    const agencyName = agency?.name || companyName
    const receiptNumber = `1000-${paymentId.replace(/-/g, "").slice(-8).toUpperCase()}`
    const receiptFileName = buildReceiptFileName(customerLastName, receiptNumber)

    const fechaPago = payment.date_paid || payment.date_due || new Date().toISOString()
    const fechaFormateada = format(parseDateValue(fechaPago), "d 'de' MMMM 'de' yyyy", { locale: es })

    const paymentCurrency = normalizeSupportedCurrency(payment.currency)
    const currencyName = paymentCurrency === "USD" ? "Dolar" : "Pesos"
    const amount = Number(payment.amount) || 0
    const amountInReceiptCurrency = getReceiptPaymentAmountInCurrency(payment, receiptCurrency)

    const serviceLabel = service?.service_type
      ? SERVICE_LABELS[service.service_type] || service.service_type
      : ""

    let concepto = payment.reference || ""
    if (!concepto && receiptScope === "SERVICE" && serviceLabel) {
      concepto = `Pago servicio ${serviceLabel}${service?.description ? ` - ${service.description}` : ""}`
    }
    if (!concepto && operation?.destination) {
      concepto = `Pago viaje ${operation.destination}`
    }
    if (!concepto) {
      concepto = "Pago de servicios turisticos"
    }

    return NextResponse.json({
      currentPaymentId: payment.id,
      receiptNumber,
      receiptScope,
      fechaFormateada,
      agencyCity,
      agencyName,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyLegajo,
      companyTaxId,
      brandColor,
      brandLogo,
      pdfTermsText,
      customerName,
      customerLastName,
      passengerNamesText,
      receiptFileName,
      customerAddress,
      customerCity,
      currencyName,
      currency: paymentCurrency,
      receiptCurrency,
      amount,
      amountInReceiptCurrency,
      concepto,
      totalOperacion,
      totalPagado,
      saldoRestante,
      destination: operation?.destination || "",
      fileCode: operation?.file_code || "",
      origin: operation?.origin || "",
      departureDate: operation?.departure_date || null,
      returnDate: operation?.return_date || null,
      adults: operation?.adults || 0,
      children: operation?.children || 0,
      infants: operation?.infants || 0,
      operationType: operation?.type || "",
      operatorName: operator?.name || "",
      serviceType: service?.service_type || "",
      serviceLabel,
      serviceDescription: service?.description || "",
      serviceOperatorName: serviceOperator?.name || "",
      paymentHistory,
    })
  } catch (error: any) {
    console.error("Error fetching receipt data:", error)
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 })
  }
}
