import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import {
  agencyPermissionMode,
  applyAgencyPermissionScope,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import type { Json } from "@/lib/supabase/types"
import { parseQuotationPresentationContent } from "@/lib/quotation-documents/schemas"
import {
  QuotationDocumentServerError,
  renderQuotationDocumentForUser,
} from "@/lib/quotation-documents/server"
import { isQuotationContentEditable } from "@/lib/quotations/lifecycle"

export const dynamic = "force-dynamic"

const issueSchema = z.object({
  expected_updated_at: z.string().datetime({ offset: true }),
  use_current_template: z.boolean().optional().default(false),
  mark_sent: z.boolean().optional().default(false),
}).strict()

const prepareSchema = z.object({
  expected_updated_at: z.string().datetime({ offset: true }),
  prices: z.array(z.object({
    option_id: z.string().uuid(),
    manual_total_amount: z.number().positive().nullable(),
  }).strict()).min(1).max(50),
  insurance_amount: z.number().nonnegative().max(1_000_000_000),
  transfer_amount: z.number().nonnegative().max(1_000_000_000),
  presentation_content: z.unknown(),
  item_operators: z.array(z.object({
    item_id: z.string().uuid(),
    operator_id: z.string().uuid(),
  }).strict()).max(500).default([]),
}).strict()

function documentResponse(document: Awaited<ReturnType<typeof renderQuotationDocumentForUser>>) {
  return NextResponse.json({
    document: {
      html: document.html,
      filename: document.filename,
      pageCount: document.pageCount,
      layoutKey: document.layoutKey,
      layoutVersion: document.layoutVersion,
      revisionId: document.revisionId,
      issuedDocumentId: document.issuedDocumentId,
      contentHash: document.contentHash,
      quotationStatus: document.quotationStatus,
      omittedRemoteAssetCount: document.omittedRemoteAssetCount,
    },
  }, {
    headers: { "Cache-Control": "no-store" },
  })
}

function errorResponse(error: unknown) {
  if (error instanceof QuotationDocumentServerError) {
    const status = error.code === "NOT_FOUND"
      ? 404
      : error.code === "FORBIDDEN"
        ? 403
        : error.code === "INVALID_CONTENT"
          ? 400
        : error.code === "QUOTATION_CHANGED" || error.code === "INVALID_STATE"
          ? 409
          : error.code === "TEMPLATE_INVALID"
            ? 422
            : 500
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }
  console.error("[quotation-document] unexpected error", error)
  return NextResponse.json({ error: "No se pudo generar el documento" }, { status: 500 })
}

async function getAccess(permission: "read" | "write") {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    throw new QuotationDocumentServerError("FORBIDDEN", "Usuario sin organización asociada")
  }
  const supabase = await createServerClient()
  const scope = await resolveAgencyPermissionScope(supabase, user, "leads", permission)
  if (scope.memberAgencyIds.length > 0 && scope.agencyIds.length === 0) {
    throw new QuotationDocumentServerError(
      "FORBIDDEN",
      permission === "write"
        ? "No tiene permiso para emitir cotizaciones"
        : "No tiene permiso para ver cotizaciones"
    )
  }

  return {
    user,
    supabase,
    scope,
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const access = await getAccess("read")
    const admin = createAdminClient()
    const document = await renderQuotationDocumentForUser({
      supabase: admin,
      templateSupabase: admin,
      quotationId: id,
      orgId: access.user.org_id!,
      accessScope: access.scope,
      purpose: "preview",
    })
    return documentResponse(document)
  } catch (error: unknown) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    return errorResponse(error)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsed = issueSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Solicitud inválida", issues: parsed.error.issues }, { status: 400 })
    }

    const access = await getAccess("write")
    const admin = createAdminClient()
    if (parsed.data.use_current_template) {
      let quotationScopeQuery = admin
        .from("quotations")
        .select("id, agency_id, seller_id")
        .eq("id", id)
        .eq("org_id", access.user.org_id!)
      quotationScopeQuery = applyAgencyPermissionScope(quotationScopeQuery, access.scope)
      const { data: quotationScopeRow } = await quotationScopeQuery.maybeSingle()
      if (!quotationScopeRow) {
        throw new QuotationDocumentServerError("NOT_FOUND", "Cotización no encontrada")
      }
      const settingsScope = await resolveAgencyPermissionScope(
        access.supabase,
        access.user,
        "settings",
        "write"
      )
      if (!agencyPermissionMode(settingsScope, quotationScopeRow.agency_id)) {
        throw new QuotationDocumentServerError(
          "FORBIDDEN",
          "No tiene permiso para reemplazar el modelo de un documento ya emitido"
        )
      }
    }
    const document = await renderQuotationDocumentForUser({
      supabase: admin,
      issueSupabase: admin,
      templateSupabase: admin,
      quotationId: id,
      orgId: access.user.org_id!,
      accessScope: access.scope,
      generatedBy: access.user.id,
      purpose: "customer",
      useCurrentTemplate: parsed.data.use_current_template,
      markSent: parsed.data.mark_sent,
      expectedUpdatedAt: parsed.data.expected_updated_at,
    })
    return documentResponse(document)
  } catch (error: unknown) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    return errorResponse(error)
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsed = prepareSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Contenido documental inválido", issues: parsed.error.issues }, { status: 400 })
    }
    const access = await getAccess("write")
    if (access.scope.agencyIds.length === 0) {
      throw new QuotationDocumentServerError("NOT_FOUND", "Cotización no encontrada")
    }

    const admin = createAdminClient()
    let quotationQuery = admin
      .from("quotations")
      .select("id, org_id, agency_id, seller_id, status, updated_at")
      .eq("id", id)
      .eq("org_id", access.user.org_id!)
    quotationQuery = applyAgencyPermissionScope(quotationQuery, access.scope)
    const { data: quotation, error: quotationError } = await quotationQuery.maybeSingle()
    if (quotationError || !quotation) {
      throw new QuotationDocumentServerError("NOT_FOUND", "Cotización no encontrada", quotationError)
    }
    if (!isQuotationContentEditable(quotation.status)) {
      throw new QuotationDocumentServerError(
        "INVALID_STATE",
        "La cotización ya está cerrada y no admite cambios de precio o contenido"
      )
    }

    const presentation = parseQuotationPresentationContent(parsed.data.presentation_content)
    const { data, error } = await admin.rpc("prepare_quotation_document_content", {
      p_quotation_id: id,
      p_expected_updated_at: parsed.data.expected_updated_at,
      p_prices: parsed.data.prices as unknown as Json,
      p_insurance_amount: parsed.data.insurance_amount,
      p_transfer_amount: parsed.data.transfer_amount,
      p_presentation_content: presentation as unknown as Json,
      p_presentation_schema_version: presentation.schemaVersion,
      p_actor_id: access.user.id,
      p_item_operators: parsed.data.item_operators as unknown as Json,
    })
    if (error || !data) {
      if (error?.code === "40001") {
        throw new QuotationDocumentServerError(
          "QUOTATION_CHANGED",
          "La cotización cambió mientras la editabas. Volvé a abrirla antes de generar el PDF.",
          error
        )
      }
      if (error?.code === "55000") {
        throw new QuotationDocumentServerError("INVALID_STATE", "La cotización ya no admite cambios", error)
      }
      if (error?.code === "22023") {
        if (String(error?.message || "").includes("currency requires an explicit exchange rate")) {
          return NextResponse.json(
            { error: "Los costos y precios deben estar en la moneda de la cotización hasta que se indique un tipo de cambio" },
            { status: 400 }
          )
        }
        return NextResponse.json({ error: "Algún precio es inválido o queda por debajo del costo" }, { status: 400 })
      }
      if (error?.code === "23514") {
        return NextResponse.json({ error: "Algún operador no es válido para esta cotización" }, { status: 400 })
      }
      throw new QuotationDocumentServerError("PERSISTENCE_FAILED", "No se pudo guardar el contenido del documento", error)
    }

    return NextResponse.json({ data: { updated_at: data.updated_at } })
  } catch (error: unknown) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    return errorResponse(error)
  }
}
