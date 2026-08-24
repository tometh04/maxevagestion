import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  agencyPermissionMode,
  applyAgencyPermissionScope,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function matchesDeclaredImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (file.type === "image/jpeg" || file.type === "image/jpg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (file.type === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte)
  }
  if (file.type === "image/webp") {
    return bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  }
  return false
}

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

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPG, PNG or WebP" }, { status: 400 })
    }
    if (!(await matchesDeclaredImageSignature(file))) {
      return NextResponse.json({ error: "El contenido del archivo no coincide con una imagen válida" }, { status: 400 })
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

    // adminDb justificado: Supabase Storage upload requiere service_role para
    // saltear ACL del bucket "documents". Se crea recién después del gate de
    // permisos y el path queda acotado por org, agencia, actor y cotización.
    adminDb ??= createAdminClient()
    const extension = IMAGE_EXTENSIONS[file.type]
    const fileName = `quotations/flight-screenshots/${user.org_id}/${agencyId}/${user.id}/${storageQuotationId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}.${extension}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await adminDb.storage
      .from("documents")
      .upload(fileName, buffer, {
        contentType: file.type,
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
