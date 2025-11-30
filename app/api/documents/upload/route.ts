import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const formData = await request.formData()

    const file = formData.get("file") as File
    const type = formData.get("type") as string
    const operationId = formData.get("operationId") as string | null
    const customerId = formData.get("customerId") as string | null

    if (!file || !type) {
      return NextResponse.json({ error: "Falta archivo o tipo de documento" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "El archivo es demasiado grande (máx 10MB)" }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileExt = file.name.split(".").pop()
    const fileName = `${timestamp}-${randomStr}.${fileExt}`

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError || !uploadData) {
      console.error("Error uploading file:", uploadError)
      return NextResponse.json({ error: "Error al subir el archivo" }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName)
    const fileUrl = urlData.publicUrl

    // Create document record
    const { data: document, error: docError } = await (supabase.from("documents") as any)
      .insert({
        operation_id: operationId || null,
        customer_id: customerId || null,
        type: type as any,
        file_url: fileUrl,
        uploaded_by_user_id: user.id,
      })
      .select()
      .single()

    if (docError || !document) {
      console.error("Error creating document record:", docError)
      // Try to delete uploaded file if document creation fails
      await supabase.storage.from("documents").remove([fileName])
      return NextResponse.json({ error: "Error al crear registro del documento" }, { status: 500 })
    }

    return NextResponse.json({ success: true, document })
  } catch (error) {
    console.error("Error in POST /api/documents/upload:", error)
    return NextResponse.json({ error: "Error al subir documento" }, { status: 500 })
  }
}


