import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"
import {
  buildQuotationDocumentData,
  createDefaultManifest,
  parseQuotationModelManifest,
  renderQuotationDocument,
  type QuotationDocumentDataV1,
  type QuotationModelManifestV1,
} from "@/lib/quotation-documents"
import { countRenderedPages } from "@/lib/quotation-documents/html"
import {
  freezeQuotationDocumentAssets,
  QuotationDocumentAssetError,
} from "@/lib/quotation-documents/assets-server"
import { withSelectedQuotationOption } from "@/lib/quotation-documents/presentation"
import { isQuotationContentEditable } from "@/lib/quotations/lifecycle"
import {
  applyAgencyPermissionScope,
  type AgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"

type DbClient = SupabaseClient<Database>

const QUOTATION_DOCUMENT_SELECT = `
  id, org_id, agency_id, quotation_number, destination, origin, region,
  departure_date, return_date, valid_until, adults, children, infants,
  currency, pricing_mode, status, insurance_amount, transfer_amount,
  package_description, notes, terms_and_conditions, payment_methods,
  presentation_content, presentation_schema_version,
  created_at, updated_at, seller_id, active_document_id,
  lead:lead_id(id, contact_name, contact_phone, contact_email),
  seller:seller_id(id, name, email),
  agency:agency_id(id, name),
  quotation_options(*),
  quotation_items(*)
`

interface QuotationSourceRow extends Record<string, unknown> {
  id: string
  org_id: string
  agency_id: string
  seller_id: string
  updated_at: string | null
  active_document_id: string | null
}

interface IssuedDocumentRow {
  id: string
  revision_id: string | null
  data_snapshot: Json
  manifest_snapshot: Json
  html_snapshot: string
  content_hash: string
  file_name: string
}

export interface ResolvedQuotationDocument {
  html: string
  filename: string
  pageCount: number
  layoutKey: string
  layoutVersion: number
  revisionId: string | null
  issuedDocumentId: string | null
  contentHash: string
  model: QuotationDocumentDataV1
  manifest: QuotationModelManifestV1
  quotationStatus: string
  quotationUpdatedAt?: string
  omittedRemoteAssetCount: number
}

export class QuotationDocumentServerError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "ASSET_INVALID"
      | "TEMPLATE_INVALID"
      | "NOT_ISSUED"
      | "INVALID_STATE"
      | "INVALID_CONTENT"
      | "QUOTATION_CHANGED"
      | "QUOTA_EXHAUSTED"
      | "PERSISTENCE_FAILED",
    message: string,
    public readonly causeValue?: unknown
  ) {
    super(message)
    this.name = "QuotationDocumentServerError"
  }
}

function canonicalHash(
  model: QuotationDocumentDataV1,
  manifest: QuotationModelManifestV1,
  frozenHtml?: string
): string {
  return createHash("sha256")
    .update(JSON.stringify({ renderer: "quotation-documents-v1", model, manifest, frozenHtml }))
    .digest("hex")
}

async function prepareDocumentForIssue(
  document: ResolvedQuotationDocument
): Promise<ResolvedQuotationDocument> {
  try {
    const logoSource = (
      document.manifest.assets.logoPath || document.model.agency.logoUrl
    )?.trim()
    const frozen = await freezeQuotationDocumentAssets(document.html, {
      additionalSources: logoSource ? [logoSource] : [],
    })
    const frozenLogo = logoSource ? frozen.frozenSources[logoSource] : undefined
    const model = frozenLogo
      ? {
          ...document.model,
          agency: { ...document.model.agency, logoUrl: frozenLogo },
        }
      : document.model
    return {
      ...document,
      model,
      html: frozen.html,
      contentHash: canonicalHash(model, document.manifest, frozen.html),
      omittedRemoteAssetCount: frozen.omittedRemoteAssetCount,
    }
  } catch (error) {
    if (error instanceof QuotationDocumentAssetError) {
      const logoSources = [
        document.manifest.assets.logoPath,
        document.model.agency.logoUrl,
      ].map(source => source?.trim()).filter(Boolean)
      const isLogo = logoSources.includes(error.source)
      const subject = isLogo ? "El logo institucional" : "Un recurso visual del documento"
      const message = error.code === "ASSET_UNSAFE"
        ? `${subject} contiene elementos no permitidos. Volvé a cargarlo desde Configuración.`
        : error.code === "ASSET_TOO_LARGE"
          ? `${subject} supera los límites permitidos. Volvé a cargar una versión más liviana.`
          : error.code === "ASSET_UNAVAILABLE"
            ? `${subject} no está disponible. Verificá el archivo configurado y volvé a intentar.`
            : `${subject} no contiene una imagen compatible. Volvé a cargarlo desde Configuración.`
      throw new QuotationDocumentServerError("ASSET_INVALID", message, error)
    }
    throw new QuotationDocumentServerError(
      "TEMPLATE_INVALID",
      "No se pudieron congelar los recursos visuales del documento",
      error
    )
  }
}

function jsonRecord(value: Json): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function effectivePublicStatus(quotation: QuotationSourceRow): string {
  const status = String(quotation.status || "DRAFT")
  const validUntil = String(quotation.valid_until || "")
  if (!["SENT", "PENDING_APPROVAL"].includes(status) || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return status
  }
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find(value => value.type === type)?.value || ""
  const today = `${part("year")}-${part("month")}-${part("day")}`
  return validUntil < today ? "EXPIRED" : status
}

async function loadOrganizationBranding(
  supabase: DbClient,
  orgId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("key, value")
    .eq("org_id", orgId)

  if (error) {
    console.warn("[quotation-documents] organization branding unavailable", {
      orgId,
      cause: error.message,
    })
    return {}
  }

  return Object.fromEntries((data || []).map(row => [
    row.key,
    typeof row.value === "string" ? row.value : row.value == null ? "" : String(row.value),
  ]))
}

async function loadRevisionManifest(
  supabase: DbClient,
  revisionId: string,
  orgId: string,
  agencyId: string
): Promise<{ revisionId: string; manifest: QuotationModelManifestV1 } | null> {
  const { data, error } = await supabase
    .from("quotation_document_revisions")
    .select("id, org_id, agency_id, status, manifest")
    .eq("id", revisionId)
    .eq("org_id", orgId)
    .in("status", ["PUBLISHED", "ARCHIVED"])
    .maybeSingle()

  if (error) {
    throw new QuotationDocumentServerError("TEMPLATE_INVALID", "No se pudo cargar la revisión documental", error)
  }
  if (!data || (data.agency_id != null && data.agency_id !== agencyId)) return null

  try {
    return { revisionId: data.id, manifest: parseQuotationModelManifest(data.manifest) }
  } catch (error) {
    throw new QuotationDocumentServerError("TEMPLATE_INVALID", "La revisión documental publicada no es válida", error)
  }
}

async function resolveEffectiveManifest(
  supabase: DbClient,
  orgId: string,
  agencyId: string
): Promise<{ revisionId: string | null; manifest: QuotationModelManifestV1 }> {
  const { data: agencyBinding, error: agencyError } = await supabase
    .from("quotation_document_bindings")
    .select("revision_id")
    .eq("org_id", orgId)
    .eq("agency_id", agencyId)
    .eq("document_kind", "quotation")
    .maybeSingle()

  if (agencyError) {
    throw new QuotationDocumentServerError("TEMPLATE_INVALID", "No se pudo resolver el modelo de la agencia", agencyError)
  }
  if (agencyBinding) {
    const revision = await loadRevisionManifest(supabase, agencyBinding.revision_id, orgId, agencyId)
    if (revision) return revision
  }

  const { data: orgBinding, error: orgError } = await supabase
    .from("quotation_document_bindings")
    .select("revision_id")
    .eq("org_id", orgId)
    .is("agency_id", null)
    .eq("document_kind", "quotation")
    .maybeSingle()

  if (orgError) {
    throw new QuotationDocumentServerError("TEMPLATE_INVALID", "No se pudo resolver el modelo de la organización", orgError)
  }
  if (orgBinding) {
    const revision = await loadRevisionManifest(supabase, orgBinding.revision_id, orgId, agencyId)
    if (revision) return revision
  }

  return { revisionId: null, manifest: createDefaultManifest("vibook-standard-v1") }
}

async function loadIssuedDocument(
  supabase: DbClient,
  documentId: string,
  orgId: string,
  agencyId: string,
  quotationId: string
): Promise<ResolvedQuotationDocument | null> {
  const { data, error } = await supabase
    .from("issued_quotation_documents")
    .select("id, revision_id, data_snapshot, manifest_snapshot, html_snapshot, content_hash, file_name")
    .eq("id", documentId)
    .eq("org_id", orgId)
    .eq("agency_id", agencyId)
    .eq("quotation_id", quotationId)
    .eq("status", "READY")
    .maybeSingle()

  if (error) {
    throw new QuotationDocumentServerError("PERSISTENCE_FAILED", "No se pudo leer el documento emitido", error)
  }
  if (!data) return null

  const row = data as IssuedDocumentRow
  const model = jsonRecord(row.data_snapshot) as unknown as QuotationDocumentDataV1
  const manifest = parseQuotationModelManifest(row.manifest_snapshot)
  return {
    html: row.html_snapshot,
    filename: row.file_name,
    pageCount: countRenderedPages(row.html_snapshot),
    layoutKey: manifest.layoutKey,
    layoutVersion: manifest.layoutVersion,
    revisionId: row.revision_id,
    issuedDocumentId: row.id,
    contentHash: row.content_hash,
    model,
    manifest,
    quotationStatus: model.identity.status,
    omittedRemoteAssetCount: 0,
  }
}

async function buildCurrentDocument(
  supabase: DbClient,
  quotation: QuotationSourceRow,
  selection?: { revisionId: string | null; manifest: QuotationModelManifestV1 }
): Promise<ResolvedQuotationDocument> {
  const branding = await loadOrganizationBranding(supabase, quotation.org_id)
  const model = buildQuotationDocumentData({ quotation, branding })
  let resolved = selection || await resolveEffectiveManifest(
    supabase,
    quotation.org_id,
    quotation.agency_id
  )
  const brandColor = branding.brand_color?.trim()
  if (!selection && resolved.revisionId === null && brandColor && /^#[0-9a-f]{6}$/i.test(brandColor)) {
    resolved = {
      ...resolved,
      manifest: {
        ...resolved.manifest,
        theme: { ...resolved.manifest.theme, primaryColor: brandColor },
      },
    }
  }
  const rendered = renderQuotationDocument({ model, manifest: resolved.manifest })
  const contentHash = canonicalHash(rendered.model, rendered.manifest)

  return {
    html: rendered.html,
    filename: rendered.filename,
    pageCount: rendered.pageCount,
    layoutKey: rendered.layoutKey,
    layoutVersion: rendered.layoutVersion,
    revisionId: resolved.revisionId,
    issuedDocumentId: null,
    contentHash,
    model: rendered.model,
    manifest: rendered.manifest,
    quotationStatus: rendered.model.identity.status,
    omittedRemoteAssetCount: 0,
  }
}

/**
 * Prepara un documento completo desde una estructura staged. No persiste nada:
 * QuotationRefresh lo entrega luego al RPC que intercambia estructura y
 * active_document_id en una sola transacción.
 */
export async function prepareQuotationDocumentForAtomicIssue(input: {
  supabase: DbClient
  quotation: Record<string, unknown>
}): Promise<ResolvedQuotationDocument> {
  return prepareDocumentForIssue(
    await buildCurrentDocument(
      input.supabase,
      input.quotation as QuotationSourceRow
    )
  )
}

async function issueDocument(
  supabase: DbClient,
  quotation: QuotationSourceRow,
  document: ResolvedQuotationDocument,
  generatedBy?: string,
  markSent = false
): Promise<ResolvedQuotationDocument> {
  const { data, error } = await supabase.rpc("issue_quotation_document", {
    p_quotation_id: quotation.id,
    p_revision_id: document.revisionId,
    p_expected_updated_at: quotation.updated_at,
    p_data_snapshot: document.model as unknown as Json,
    p_manifest_snapshot: document.manifest as unknown as Json,
    p_html_snapshot: document.html,
    p_content_hash: document.contentHash,
    p_file_name: document.filename,
    p_generated_by: generatedBy || null,
    p_mark_sent: markSent,
  })

  if (error || !data) {
    const isConcurrent = error?.code === "40001"
    const isInvalidState = error?.code === "55000"
    const isInvalidContent = error?.code === "22023" || error?.code === "23514"
    const isQuotaExhausted = error?.code === "P4201"
    throw new QuotationDocumentServerError(
      isQuotaExhausted
        ? "QUOTA_EXHAUSTED"
        : isConcurrent
        ? "QUOTATION_CHANGED"
        : isInvalidState
          ? "INVALID_STATE"
          : isInvalidContent
            ? "INVALID_CONTENT"
          : "PERSISTENCE_FAILED",
      isQuotaExhausted
        ? "La organización alcanzó el límite de cotizaciones de este ciclo. Comprá más créditos para emitir otro PDF."
        : isConcurrent
        ? "La cotización cambió mientras se generaba el documento. Volvé a intentarlo."
        : isInvalidState
          ? "La cotización ya no admite una nueva emisión"
          : isInvalidContent
            ? "Revisá los precios, las monedas y los datos de los servicios antes de emitir"
            : "No se pudo congelar el documento de la cotización",
      error
    )
  }

  const issued = (Array.isArray(data) ? data[0] : data) as typeof data
  if (!issued) {
    throw new QuotationDocumentServerError("PERSISTENCE_FAILED", "No se pudo leer el documento emitido")
  }

  let committedQuotation: {
    active_document_id?: string | null
    status?: string | null
    updated_at?: string | null
  } | null = null
  try {
    const { data: currentQuotation } = await supabase
      .from("quotations")
      .select("active_document_id, status, updated_at")
      .eq("id", quotation.id)
      .eq("org_id", quotation.org_id)
      .eq("agency_id", quotation.agency_id)
      .maybeSingle()
    if (currentQuotation?.active_document_id === issued.id) {
      committedQuotation = currentQuotation
    }
  } catch {
    // El RPC ya confirmó la emisión. Esta lectura sólo completa la versión que
    // el cliente necesita para reintentar sin reutilizar un CAS anterior.
  }

  return {
    ...document,
    revisionId: issued.revision_id,
    issuedDocumentId: issued.id,
    contentHash: issued.content_hash,
    html: issued.html_snapshot,
    filename: issued.file_name,
    quotationStatus: committedQuotation?.status || document.quotationStatus,
    quotationUpdatedAt: committedQuotation?.updated_at || undefined,
  }
}

async function loadQuotationForUser(
  supabase: DbClient,
  input: {
    quotationId: string
    orgId: string
    accessScope: AgencyPermissionScope
  }
): Promise<QuotationSourceRow> {
  if (input.accessScope.agencyIds.length === 0) {
    throw new QuotationDocumentServerError("NOT_FOUND", "Cotización no encontrada")
  }

  let query = supabase
    .from("quotations")
    .select(QUOTATION_DOCUMENT_SELECT)
    .eq("id", input.quotationId)
    .eq("org_id", input.orgId)
  query = applyAgencyPermissionScope(query, input.accessScope)

  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new QuotationDocumentServerError("NOT_FOUND", "Cotización no encontrada", error)
  }
  if (!data) throw new QuotationDocumentServerError("NOT_FOUND", "Cotización no encontrada")
  return data as unknown as QuotationSourceRow
}

export async function renderQuotationDocumentForUser(input: {
  supabase: DbClient
  issueSupabase?: DbClient
  templateSupabase?: DbClient
  quotationId: string
  orgId: string
  accessScope: AgencyPermissionScope
  generatedBy?: string
  purpose: "preview" | "customer"
  useCurrentTemplate?: boolean
  markSent?: boolean
  expectedUpdatedAt?: string
}): Promise<ResolvedQuotationDocument> {
  if (input.purpose === "customer" && (!input.issueSupabase || !input.generatedBy)) {
    throw new QuotationDocumentServerError(
      "PERSISTENCE_FAILED",
      "La emisión requiere un contexto de escritura validado"
    )
  }
  const quotation = await loadQuotationForUser(input.supabase, input)
  if (
    input.purpose === "customer"
    && (!input.expectedUpdatedAt || quotation.updated_at !== input.expectedUpdatedAt)
  ) {
    throw new QuotationDocumentServerError(
      "QUOTATION_CHANGED",
      "La cotización cambió antes de emitir el documento. Recargala y volvé a intentarlo."
    )
  }
  const quotationStatus = String(quotation.status || "DRAFT")
  const quotationForRender = input.markSent && quotationStatus === "DRAFT"
    ? { ...quotation, status: "SENT" }
    : quotation
  const immutableStatus = !isQuotationContentEditable(quotationStatus)
  const documentSupabase = input.purpose === "customer"
    ? input.issueSupabase!
    : input.templateSupabase || input.supabase

  let activeDocument: ResolvedQuotationDocument | null = null
  if (input.purpose === "customer" && quotation.active_document_id) {
    activeDocument = await loadIssuedDocument(
      documentSupabase,
      quotation.active_document_id,
      quotation.org_id,
      quotation.agency_id,
      quotation.id
    )
    if (activeDocument) activeDocument.quotationStatus = quotationStatus
  }

  if (input.purpose === "customer" && activeDocument && !input.useCurrentTemplate) {
    if (immutableStatus) return activeDocument
    const currentWithFrozenTemplate = await prepareDocumentForIssue(await buildCurrentDocument(documentSupabase, quotationForRender, {
      revisionId: activeDocument.revisionId,
      manifest: activeDocument.manifest,
    }))
    if (currentWithFrozenTemplate.contentHash === activeDocument.contentHash && !input.markSent) {
      return activeDocument
    }
    return issueDocument(
      input.issueSupabase!,
      quotation,
      currentWithFrozenTemplate,
      input.generatedBy,
      input.markSent
    )
  }

  if (input.purpose === "customer" && immutableStatus) {
    throw new QuotationDocumentServerError(
      "INVALID_STATE",
      "La cotización ya está cerrada y no admite una nueva emisión"
    )
  }

  const current = await prepareDocumentForIssue(await buildCurrentDocument(documentSupabase, quotationForRender))
  return input.purpose === "customer"
    ? issueDocument(input.issueSupabase!, quotation, current, input.generatedBy, input.markSent)
    : current
}

export async function renderQuotationDocumentForPublic(input: {
  supabase: DbClient
  token: string
}): Promise<ResolvedQuotationDocument> {
  const { data, error } = await input.supabase
    .from("quotations")
    .select(QUOTATION_DOCUMENT_SELECT)
    .eq("public_token", input.token)
    .maybeSingle()

  if (error || !data) {
    throw new QuotationDocumentServerError("NOT_FOUND", "Cotización no encontrada", error)
  }

  const quotation = data as unknown as QuotationSourceRow
  if (!quotation.active_document_id) {
    // Compatibilidad de cutover: los links públicos enviados antes de existir
    // issued_quotation_documents siguen siendo legibles/descargables. Es una
    // preview live y deliberadamente no habilita aceptación (id emitido null).
    const legacyPreview = await prepareDocumentForIssue(
      await buildCurrentDocument(input.supabase, quotation)
    )
    legacyPreview.quotationStatus = effectivePublicStatus(quotation)
    return legacyPreview
  }

  const active = await loadIssuedDocument(
    input.supabase,
    quotation.active_document_id,
    quotation.org_id,
    quotation.agency_id,
    quotation.id
  )
  if (!active) {
    throw new QuotationDocumentServerError(
      "NOT_ISSUED",
      "La cotización todavía no tiene un documento disponible"
    )
  }
  active.quotationStatus = effectivePublicStatus(quotation)
  const liveOptions = Array.isArray(quotation.quotation_options)
    ? quotation.quotation_options as Array<Record<string, unknown>>
    : []
  const selectedOptionId = liveOptions.find(option => option.is_selected === true)?.id
  if (typeof selectedOptionId === "string") {
    active.model = withSelectedQuotationOption(active.model, selectedOptionId)
  }
  return active
}
