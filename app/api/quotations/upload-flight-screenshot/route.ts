import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): exigir org_id explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // adminDb justificado: Supabase Storage upload requiere service_role para
    // saltear ACL del bucket "documents". El path incluye sanitización fuerte
    // y el quotationId del body no permite path traversal.
    const adminDb = createAdminClient()
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const quotationId = String(formData.get("quotationId") || "draft").trim() || "draft"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPG, PNG or WebP" }, { status: 400 })
    }

    const extension = file.name.split(".").pop() || "png"
    const sanitizedQuotationId = quotationId.replace(/[^a-zA-Z0-9-_]/g, "") || "draft"
    const fileName = `quotations/flight-screenshots/${sanitizedQuotationId}/${Date.now()}-${Math.random()
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
