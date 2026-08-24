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

export const dynamic = "force-dynamic"

// POST — convierte el snapshot aceptado en una operación, de forma atómica.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      .select("id, org_id, agency_id, seller_id, status, operation_id")
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

    if (!quotation.agency_id || !["APPROVED", "CONVERTED"].includes(quotation.status)) {
      return NextResponse.json(
        { error: `La cotización no se puede convertir desde el estado ${quotation.status}` },
        { status: 409 }
      )
    }

    // Una repetición idempotente no consume una segunda operación ni debe ser
    // bloqueada por un límite alcanzado después de la primera conversión.
    if (quotation.status === "APPROVED") {
      const limit = await checkLimit(supabase, user.org_id, "max_operations_per_month")
      if (!limit.ok) {
        return NextResponse.json({ error: limit.message }, { status: 403 })
      }
    }

    const commissionSnapshot = quotation.status === "APPROVED"
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
    })

    const warnings: string[] = []
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
