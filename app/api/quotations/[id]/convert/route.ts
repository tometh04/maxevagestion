import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { generateFileCode } from "@/lib/accounting/file-code"
import { checkLimit } from "@/lib/billing/limits"
import { getClientIP, logAudit } from "@/lib/audit"
import {
  canAccessAgencyResource,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import {
  convertQuotationToOperation,
  QuotationConversionError,
} from "@/lib/quotations/conversion"
import {
  captureQuotationCommissionSnapshot,
  ensureQuotationCommissionReviewAlert,
  processQuotationConversionEffects,
} from "@/lib/quotations/conversion-effects"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import {
  bookingFormSchema,
  bookingItemsFromQuotation,
  enqueueProviderBooking,
} from "@/lib/provider-booking/booking"
import { z } from "zod"

export const dynamic = "force-dynamic"

const priceConfirmationSchema = z.object({
  price_refresh_run_id: z.string().uuid(),
  option_id: z.string().uuid(),
})

// POST — convierte el snapshot aceptado en una operación, de forma atómica.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawBody = typeof (request as any).json === "function"
      ? await (request as any).json().catch(() => null)
      : null
    const bookingForm = rawBody?.booking ? bookingFormSchema.safeParse(rawBody.booking) : null
    const priceConfirmation = priceConfirmationSchema.safeParse(rawBody || {})
    if (bookingForm && !bookingForm.success) {
      return NextResponse.json({ error: "Los datos de titular y pasajeros no son válidos", details: bookingForm.error.flatten() }, { status: 400 })
    }
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const { id } = await params
    const supabase = await createServerClient()
    const [quotationScope, operationScope] = await Promise.all([
      resolveAgencyPermissionScope(supabase, user, "leads", "write"),
      resolveAgencyPermissionScope(supabase, user, "operations", "write"),
    ])
    const memberAgencyIds = quotationScope.memberAgencyIds.filter((agencyId) =>
      operationScope.memberAgencyIds.includes(agencyId)
    )
    if (memberAgencyIds.length === 0) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    const admin = createAdminClient()
    let quotationQuery = admin
      .from("quotations")
      .select("id, org_id, agency_id, seller_id, status, operation_id, quotation_options(id,is_selected), quotation_items(id,option_id,item_type,provider,cost_amount,cost_currency,currency,cost_basis,gross_price,offer_source)")
      .eq("id", id)
      .eq("org_id", user.org_id)
      .in("agency_id", memberAgencyIds)

    const { data: quotation, error: quotationError } = await quotationQuery.maybeSingle()
    if (
      quotationError
      || !quotation
      || !canAccessAgencyResource(quotationScope, quotation)
      || !canAccessAgencyResource(operationScope, quotation)
    ) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    const isDirectPriceConfirmation = ["DRAFT", "SENT", "PENDING_APPROVAL"].includes(quotation.status)
      && bookingForm?.success === true
      && priceConfirmation.success
    if (!quotation.agency_id || (!["APPROVED", "CONVERTED"].includes(quotation.status) && !isDirectPriceConfirmation)) {
      return NextResponse.json(
        { error: `La cotización no se puede convertir desde el estado ${quotation.status}` },
        { status: 409 }
      )
    }

    const providerItems = bookingForm?.success
      ? bookingItemsFromQuotation(quotation, priceConfirmation.success ? priceConfirmation.data.option_id : undefined)
      : []
    if (bookingForm?.success && providerItems.length === 0) {
      return NextResponse.json({ error: "La opción aceptada no contiene ofertas Delfos reservables con su referencia original" }, { status: 422 })
    }

    // Una repetición idempotente no consume una segunda operación ni debe ser
    // bloqueada por un límite alcanzado después de la primera conversión.
    if (quotation.status !== "CONVERTED") {
      const limit = await checkLimit(supabase, user.org_id, "max_operations_per_month")
      if (!limit.ok) {
        return NextResponse.json({ error: limit.message }, { status: 403 })
      }
    }

    const commissionSnapshot = quotation.status !== "CONVERTED"
      ? await captureQuotationCommissionSnapshot({
          supabase: admin,
          orgId: user.org_id,
          agencyId: quotation.agency_id,
          sellerIds: [quotation.seller_id],
        })
      : null

    const conversion = await convertQuotationToOperation({
      supabase: admin,
      quotationId: quotation.id,
      orgId: user.org_id,
      agencyId: quotation.agency_id,
      actorId: user.id,
      fileCode: generateFileCode(),
      commissionSnapshot,
      ...(priceConfirmation.success ? {
        priceRefreshRunId: priceConfirmation.data.price_refresh_run_id,
        selectedOptionId: priceConfirmation.data.option_id,
      } : {}),
    })

    const warnings: string[] = []
    let providerBooking: { request_id: string; job_id: string; status: string } | null = null
    let commissionErrors: string[] = []
    let financialEffectsStatus = "PENDING"
    try {
      const effects = await processQuotationConversionEffects({
        supabase: admin,
        operationId: conversion.operationId,
        orgId: user.org_id,
      })
      financialEffectsStatus = effects.status
      commissionErrors = effects.errors
      if (effects.warnings.length > 0) {
        console.warn("[quotation-conversion] commission snapshot warnings", {
          operationId: conversion.operationId,
          warnings: effects.warnings,
        })
      }
    } catch (error) {
      console.error("[quotation-conversion] durable commission processing failed", error)
      commissionErrors = [error instanceof Error ? error.message : "Error inesperado"]
      financialEffectsStatus = "REVIEW"
    }

    if (commissionErrors.length > 0) {
      console.error("[quotation-conversion] commission review required", {
        operationId: conversion.operationId,
        errors: commissionErrors,
      })
      const alertPersisted = await ensureQuotationCommissionReviewAlert({
        supabase: admin,
        orgId: user.org_id,
        operationId: conversion.operationId,
        userId: user.id,
        fileCode: conversion.fileCode,
      })
      warnings.push(alertPersisted
        ? "La operación quedó creada, pero el cálculo de comisiones requiere revisión. Se generó una alerta."
        : "La operación quedó creada y el cálculo de comisiones requiere revisión, pero no se pudo generar la alerta. Avisá a un administrador."
      )
    } else if (financialEffectsStatus === "PROCESSING" || financialEffectsStatus === "PENDING") {
      warnings.push("La operación quedó creada y sus comisiones se están procesando de forma segura.")
    }
    if (bookingForm?.success) {
      try {
        const queued = await enqueueProviderBooking({
          admin,
          orgId: user.org_id,
          agencyId: quotation.agency_id,
          quotationId: quotation.id,
          operationId: conversion.operationId,
          form: bookingForm.data,
          items: providerItems,
        })
        const { error: bookingWriteError } = await (admin as any).from("quotation_provider_bookings").upsert({
          org_id: user.org_id,
          agency_id: quotation.agency_id,
          quotation_id: quotation.id,
          operation_id: conversion.operationId,
          request_id: queued.requestId,
          remote_job_id: queued.jobId,
          status: String(queued.status || "queued").toUpperCase(),
          created_by: user.id,
          request_snapshot: {
            holder: bookingForm.data.holder, travellers: bookingForm.data.travellers,
            items: providerItems.map(({ client_item_id, product, expected_price }) => ({ client_item_id, product, expected_price })),
          },
        }, { onConflict: "quotation_id", ignoreDuplicates: true })
        if (bookingWriteError) throw new Error("No se pudo guardar el seguimiento de la reserva")
        providerBooking = { request_id: queued.requestId, job_id: queued.jobId, status: queued.status }
      } catch (bookingError) {
        warnings.push(bookingError instanceof Error ? bookingError.message : "La operación quedó creada, pero no se pudo encolar la reserva")
      }
    }

    await logAudit(supabase, {
      user_id: user.id,
      user_email: user.email,
      action: "CONVERT",
      entity_type: "quotation",
      entity_id: quotation.id,
      ip_address: getClientIP(request) || undefined,
      details: {
        operation_id: conversion.operationId,
        file_code: conversion.fileCode,
        services_created: conversion.servicesCreated,
        already_converted: conversion.alreadyConverted,
        financial_effects_status: financialEffectsStatus,
        warnings,
        commission_errors: commissionErrors,
      },
    })

    return NextResponse.json({
      data: {
        operation_id: conversion.operationId,
        file_code: conversion.fileCode,
        services_created: conversion.servicesCreated,
        already_converted: conversion.alreadyConverted,
        financial_effects_status: financialEffectsStatus,
        ...(bookingForm?.success ? { provider_booking: providerBooking } : {}),
      },
      warnings,
    })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    if (error instanceof QuotationConversionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("[quotation-conversion] unexpected error", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
