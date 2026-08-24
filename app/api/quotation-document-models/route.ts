import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import {
  QuotationAuthoringError,
  loadQuotationAuthoringWorkspace,
  publishQuotationModelRevision,
  saveQuotationModelDraft,
} from "@/lib/quotation-documents/authoring-server"

const saveSchema = z.object({
  agency_id: z.string().uuid(),
  model_id: z.string().uuid().optional(),
  expected_revision_id: z.string().uuid().nullable(),
  expected_revision_updated_at: z.string().datetime({ offset: true }).nullable(),
  name: z.string().trim().min(2).max(160),
  manifest: z.unknown(),
}).strict()

const publishSchema = z.object({
  revision_id: z.string().uuid(),
  expected_revision_updated_at: z.string().datetime({ offset: true }),
}).strict()

function errorResponse(error: unknown) {
  if (error instanceof QuotationAuthoringError) {
    const status = error.code === "FORBIDDEN"
      ? 403
      : error.code === "NOT_FOUND"
        ? 404
        : error.code === "INVALID"
          ? 400
          : error.code === "CONFLICT"
            ? 409
            : 500
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }
  console.error("[quotation-models] unexpected error", error)
  return NextResponse.json({ error: "No se pudo gestionar el modelo" }, { status: 500 })
}

async function getAccess() {
  const { user } = await getCurrentUser()
  if (!user.org_id) throw new QuotationAuthoringError("FORBIDDEN", "Usuario sin organización asociada")
  const supabase = await createServerClient()
  const scope = await resolveAgencyPermissionScope(supabase, user, "settings", "write")
  if (scope.agencyIds.length === 0) {
    throw new QuotationAuthoringError("FORBIDDEN", "No tiene permiso para administrar modelos")
  }
  return { user, supabase, scope }
}

export async function GET(request: Request) {
  try {
    const access = await getAccess()
    const agencyId = new URL(request.url).searchParams.get("agency_id") || undefined
    const workspace = await loadQuotationAuthoringWorkspace({
      supabase: createAdminClient(),
      orgId: access.user.org_id!,
      agencyId,
      allowedAgencyIds: access.scope.agencyIds,
    })
    return NextResponse.json({ data: workspace }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    return errorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = saveSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 })
    const access = await getAccess()
    const admin = createAdminClient()
    const saved = await saveQuotationModelDraft({
      supabase: admin,
      orgId: access.user.org_id!,
      userId: access.user.id,
      allowedAgencyIds: access.scope.agencyIds,
      agencyId: parsed.data.agency_id,
      modelId: parsed.data.model_id,
      expectedRevisionId: parsed.data.expected_revision_id,
      expectedRevisionUpdatedAt: parsed.data.expected_revision_updated_at,
      name: parsed.data.name,
      manifest: parsed.data.manifest,
    })
    return NextResponse.json({ data: saved })
  } catch (error) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const parsed = publishSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 })
    const access = await getAccess()
    const admin = createAdminClient()
    const revision = await publishQuotationModelRevision({
      supabase: admin,
      orgId: access.user.org_id!,
      userId: access.user.id,
      revisionId: parsed.data.revision_id,
      expectedRevisionUpdatedAt: parsed.data.expected_revision_updated_at,
      allowedAgencyIds: access.scope.agencyIds,
    })
    return NextResponse.json({ data: revision })
  } catch (error) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    return errorResponse(error)
  }
}
