import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  agencyPermissionMode,
  applyAgencyPermissionScope,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import {
  detectVisualImageMime,
  materializeVisualImage,
  VisualImageError,
} from "@/lib/document-assets/visual-image-server"

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): exigir org_id explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const quotationId = String(formData.get("quotationId") || "").trim()
    const requestedAgencyId = String(formData.get("agencyId") || "").trim()

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    if (quotationId && !UUID_PATTERN.test(quotationId)) {
      return NextResponse.json({ error: "quotationId inválido" }, { status: 400 })
    }
    if (requestedAgencyId && !UUID_PATTERN.test(requestedAgencyId)) {
      return NextResponse.json({ error: "agencyId inválido" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "write")
    if (scope.memberAgencyIds.length > 0 && scope.agencyIds.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (scope.memberAgencyIds.length === 0) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
    }

    let agencyId = requestedAgencyId
    let storageQuotationId = "draft"
    let adminDb: ReturnType<typeof createAdminClient> | null = null

    if (quotationId) {
      // Service role recién después de resolver auth, permiso y agencias. La
      // lectura queda además acotada por org/agencia/own-data.
      adminDb = createAdminClient()
      let quotationQuery = (adminDb.from("quotations") as any)
        .select("id, agency_id, seller_id")
        .eq("id", quotationId)
        .eq("org_id", user.org_id)
      quotationQuery = applyAgencyPermissionScope(quotationQuery, scope)

      const { data: quotation, error: quotationError } = await quotationQuery.maybeSingle()
      if (quotationError) {
        console.error("Quotation flight screenshot scope error:", quotationError)
        return NextResponse.json({ error: "Error validating quotation" }, { status: 500 })
      }
      if (!quotation || (agencyId && agencyId !== quotation.agency_id)) {
        return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
      }

      agencyId = quotation.agency_id
      storageQuotationId = quotation.id
    } else {
      if (!agencyId) {
        return NextResponse.json({ error: "agencyId es requerido para un borrador" }, { status: 400 })
      }
      if (!agencyPermissionMode(scope, agencyId)) {
        return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
      }
    }

    let visual
    try {
      const fileBytes = Buffer.from(await file.arrayBuffer())
      const detectedMime = detectVisualImageMime(fileBytes)
      if (!detectedMime || !ALLOWED_IMAGE_TYPES.has(detectedMime)) {
        throw new VisualImageError("UNSUPPORTED_FORMAT", "Invalid file type. Use JPG, PNG or WebP")
      }
      visual = await materializeVisualImage({
        bytes: fileBytes,
        declaredMime: file.type,
        maxDimension: 16_384,
        maxInputBytes: MAX_FILE_SIZE_BYTES,
        maxOutputBytes: MAX_FILE_SIZE_BYTES,
        maxPixels: 64_000_000,
      })
    } catch (error) {
      if (error instanceof VisualImageError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
      }
      throw error
    }

    // adminDb justificado: Supabase Storage upload requiere service_role para
    // saltear ACL del bucket "documents". Se crea recién después del gate de
    // permisos y el path queda acotado por org, agencia, actor y cotización.
    adminDb ??= createAdminClient()
    const fileName = `quotations/flight-screenshots/${user.org_id}/${agencyId}/${user.id}/${storageQuotationId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}.${visual.extension}`

    const { error: uploadError } = await adminDb.storage
      .from("documents")
      .upload(fileName, visual.bytes, {
        contentType: visual.mime,
        upsert: false,
      })

    if (uploadError) {
      console.error("Quotation flight screenshot upload error:", uploadError)
      return NextResponse.json({ error: "Error uploading screenshot" }, { status: 500 })
    }

    const { data: urlData } = adminDb.storage.from("documents").getPublicUrl(fileName)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error) {
    console.error("Quotation flight screenshot route error:", error)
    return NextResponse.json({ error: "Error uploading screenshot" }, { status: 500 })
  }
}
