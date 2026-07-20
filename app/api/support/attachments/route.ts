import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * POST /api/support/attachments
 *
 * Sube un adjunto de ticket de soporte al bucket público `documents` bajo el
 * prefijo `support/`. Devuelve la metadata que después se guarda en
 * support_tickets.attachments y se manda a Linear.
 *
 * Usa el service-role client SOLO para Storage (las bucket policies son un
 * scope separado del RLS de la DB — mismo patrón que el resto de los uploads).
 * No escribe en la base acá.
 */
export async function POST(request: Request) {
  try {
    await getCurrentUser()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Tipo no permitido. Usá JPG, PNG, WebP, GIF o PDF." },
      { status: 400 },
    )
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El archivo supera los 10MB" }, { status: 400 })
  }

  const storage = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 15)
  const fileExt = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "")
  const fileName = `support/${timestamp}-${randomStr}.${fileExt}`

  const fileBuffer = await file.arrayBuffer()
  const { error: uploadError } = await storage.storage
    .from("documents")
    .upload(fileName, fileBuffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error("Error subiendo adjunto de soporte:", uploadError)
    return NextResponse.json({ error: "Error al subir el archivo" }, { status: 500 })
  }

  const { data: urlData } = storage.storage.from("documents").getPublicUrl(fileName)

  return NextResponse.json({
    attachment: {
      name: file.name,
      url: urlData.publicUrl,
      type: file.type,
      size: file.size,
    },
  })
}
