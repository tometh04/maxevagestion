import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"
import {
  KYO_FULL_ITINERARY_FIXTURE,
  cloneQuotationJson,
  getQuotationLayoutCatalog,
  parseQuotationModelManifest,
  renderQuotationDocument,
  type QuotationModelManifestV1,
} from "@/lib/quotation-documents"

type DbClient = SupabaseClient<Database>

export class QuotationAuthoringError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "PERSISTENCE_FAILED",
    message: string,
    public readonly causeValue?: unknown
  ) {
    super(message)
    this.name = "QuotationAuthoringError"
  }
}

function assertManifestLayout(manifest: QuotationModelManifestV1) {
  const layout = getQuotationLayoutCatalog().find(item => item.key === manifest.layoutKey)
  if (!layout || layout.version !== manifest.layoutVersion) {
    throw new QuotationAuthoringError(
      "INVALID",
      `El layout ${manifest.layoutKey}@${manifest.layoutVersion} no está disponible`
    )
  }
  const unsupported = manifest.blocks.find(block => block.visible && !layout.supports.includes(block.kind))
  if (unsupported) {
    throw new QuotationAuthoringError(
      "INVALID",
      `El layout seleccionado no soporta el bloque ${unsupported.kind}`
    )
  }
}

export function validateAuthoringManifest(value: unknown): QuotationModelManifestV1 {
  try {
    const manifest = parseQuotationModelManifest(value)
    assertManifestLayout(manifest)
    return manifest
  } catch (error) {
    if (error instanceof QuotationAuthoringError) throw error
    throw new QuotationAuthoringError("INVALID", "La configuración del modelo no es válida", error)
  }
}

export async function assertAgencyAuthoringScope(input: {
  supabase: DbClient
  orgId: string
  agencyId: string
  allowedAgencyIds: readonly string[]
}) {
  if (!input.allowedAgencyIds.includes(input.agencyId)) {
    throw new QuotationAuthoringError("FORBIDDEN", "No tiene acceso a esta agencia")
  }
  const { data, error } = await input.supabase
    .from("agencies")
    .select("id, name")
    .eq("id", input.agencyId)
    .eq("org_id", input.orgId)
    .maybeSingle()
  if (error || !data) {
    throw new QuotationAuthoringError("NOT_FOUND", "Agencia no encontrada", error)
  }
  return data
}

export async function loadQuotationAuthoringWorkspace(input: {
  supabase: DbClient
  orgId: string
  agencyId?: string
  allowedAgencyIds: readonly string[]
}) {
  const agencyQuery = input.supabase
    .from("agencies")
    .select("id, name")
    .eq("org_id", input.orgId)
    .order("name")

  const { data: agencyRows, error: agencyError } = input.allowedAgencyIds.length > 0
    ? await agencyQuery.in("id", [...input.allowedAgencyIds])
    : { data: [], error: null }
  if (agencyError) {
    throw new QuotationAuthoringError("PERSISTENCE_FAILED", "No se pudieron cargar las agencias", agencyError)
  }

  if (!input.agencyId) {
    return { agencies: agencyRows || [], layouts: getQuotationLayoutCatalog(), models: [], activeRevisionId: null }
  }

  await assertAgencyAuthoringScope({ ...input, agencyId: input.agencyId })
  const { data: models, error: modelsError } = await input.supabase
    .from("quotation_document_models")
    .select("id, key, name, agency_id, created_at, updated_at")
    .eq("org_id", input.orgId)
    .eq("agency_id", input.agencyId)
    .eq("document_kind", "quotation")
    .order("updated_at", { ascending: false })
  if (modelsError) {
    throw new QuotationAuthoringError("PERSISTENCE_FAILED", "No se pudieron cargar los modelos", modelsError)
  }

  const modelIds = (models || []).map(model => model.id)
  const { data: revisions, error: revisionsError } = modelIds.length > 0
    ? await input.supabase
        .from("quotation_document_revisions")
        .select("id, model_id, revision_number, status, layout_key, layout_version, manifest, published_at, created_at, updated_at")
        .eq("org_id", input.orgId)
        .eq("agency_id", input.agencyId)
        .in("model_id", modelIds)
        .order("revision_number", { ascending: false })
    : { data: [], error: null }
  if (revisionsError) {
    throw new QuotationAuthoringError("PERSISTENCE_FAILED", "No se pudieron cargar las revisiones", revisionsError)
  }

  const { data: binding, error: bindingError } = await input.supabase
    .from("quotation_document_bindings")
    .select("revision_id")
    .eq("org_id", input.orgId)
    .eq("agency_id", input.agencyId)
    .eq("document_kind", "quotation")
    .maybeSingle()
  if (bindingError) {
    throw new QuotationAuthoringError("PERSISTENCE_FAILED", "No se pudo cargar la publicación activa", bindingError)
  }

  return {
    agencies: agencyRows || [],
    layouts: getQuotationLayoutCatalog(),
    models: (models || []).map(model => ({
      ...model,
      revisions: (revisions || []).filter(revision => revision.model_id === model.id),
    })),
    activeRevisionId: binding?.revision_id || null,
  }
}

export async function saveQuotationModelDraft(input: {
  supabase: DbClient
  orgId: string
  userId: string
  agencyId: string
  allowedAgencyIds: readonly string[]
  modelId?: string
  expectedRevisionId: string | null
  expectedRevisionUpdatedAt: string | null
  name: string
  manifest: unknown
}) {
  await assertAgencyAuthoringScope(input)
  const name = input.name.trim()
  if (name.length < 2 || name.length > 160) {
    throw new QuotationAuthoringError("INVALID", "El nombre debe tener entre 2 y 160 caracteres")
  }
  const manifest = validateAuthoringManifest(input.manifest)
  const { data, error } = await input.supabase.rpc("save_quotation_document_model_draft", {
    p_org_id: input.orgId,
    p_agency_id: input.agencyId,
    p_model_id: input.modelId || null,
    p_name: name,
    p_manifest: manifest as unknown as Json,
    p_layout_key: manifest.layoutKey,
    p_layout_version: manifest.layoutVersion,
    p_schema_version: manifest.schemaVersion,
    p_created_by: input.userId,
    p_expected_revision_id: input.expectedRevisionId,
    p_expected_revision_updated_at: input.expectedRevisionUpdatedAt,
  })
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    const code = error?.code === "P0002"
      ? "NOT_FOUND"
      : error?.code === "40001"
        ? "CONFLICT"
        : error?.code === "22023" || error?.code === "23514"
          ? "INVALID"
          : "PERSISTENCE_FAILED"
    throw new QuotationAuthoringError(
      code,
      code === "CONFLICT"
        ? "El modelo cambió en otra sesión. Recargalo antes de volver a guardar."
        : code === "INVALID"
          ? "El borrador no respeta el contrato del modelo o su versión esperada."
        : "No se pudo guardar el borrador",
      error
    )
  }
  const result = data as {
    model?: Database["public"]["Tables"]["quotation_document_models"]["Row"]
    revision?: Database["public"]["Tables"]["quotation_document_revisions"]["Row"]
  }
  if (!result.model?.id || !result.revision?.id) {
    throw new QuotationAuthoringError("PERSISTENCE_FAILED", "El guardado devolvió una respuesta incompleta")
  }
  return { model: result.model, revision: result.revision }
}

export async function publishQuotationModelRevision(input: {
  supabase: DbClient
  orgId: string
  userId: string
  revisionId: string
  expectedRevisionUpdatedAt: string
  allowedAgencyIds: readonly string[]
}) {
  const { data: revision, error: readError } = await input.supabase
    .from("quotation_document_revisions")
    .select("id, agency_id, status, manifest, updated_at")
    .eq("id", input.revisionId)
    .eq("org_id", input.orgId)
    .maybeSingle()
  if (readError || !revision) throw new QuotationAuthoringError("NOT_FOUND", "Borrador no encontrado", readError)
  if (!revision.agency_id || !input.allowedAgencyIds.includes(revision.agency_id)) {
    throw new QuotationAuthoringError("FORBIDDEN", "No tiene acceso a este modelo")
  }
  if (revision.status !== "DRAFT") {
    throw new QuotationAuthoringError("INVALID", "Solo se puede publicar una revisión en borrador")
  }
  if (revision.updated_at !== input.expectedRevisionUpdatedAt) {
    throw new QuotationAuthoringError(
      "CONFLICT",
      "El borrador cambió en otra sesión. Recargalo antes de publicarlo."
    )
  }
  // No confiar en que el borrador conservó un manifiesto válido desde el
  // último guardado: validamos nuevamente el contrato y el layout justo antes
  // de volverlo inmutable y activo para la agencia.
  validateAuthoringManifest(revision.manifest)
  const { data, error } = await input.supabase.rpc("publish_quotation_document_revision", {
    p_revision_id: revision.id,
    p_published_by: input.userId,
    p_expected_revision_updated_at: input.expectedRevisionUpdatedAt,
  })
  if (error || !data) {
    throw new QuotationAuthoringError(
      error?.code === "40001" ? "CONFLICT" : "PERSISTENCE_FAILED",
      error?.code === "40001"
        ? "El borrador cambió en otra sesión. Recargalo antes de publicarlo."
        : "No se pudo publicar el modelo",
      error
    )
  }
  return data
}

export async function previewQuotationModel(input: {
  manifest: unknown
  agencyId: string
  agencyName: string
}) {
  const manifest = validateAuthoringManifest(input.manifest)
  const model = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
  model.agency.id = input.agencyId
  model.agency.name = input.agencyName
  return renderQuotationDocument({ model, manifest })
}
