import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

// POST — Subir el logo de la organización a Storage y guardarlo en
// organization_settings.brand_logo.
//
// Antes esto se hacía client-side directo contra Storage (interface-settings)
// y fallaba SIEMPRE con RLS violation (las policies de storage.objects de la
// migración 074 no están aplicadas en prod), cayendo al fallback data URL:
// logos de hasta ~200KB embebidos en organization_settings. Server-side con
// service role sigue el patrón de los demás uploads (/api/documents/upload).
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "Falta el archivo del logo" }, { status: 400 })
    }

    const allowedTypes: Record<string, string> = {
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/webp": "webp",
    }
    const ext = allowedTypes[file.type]
    if (!ext) {
      return NextResponse.json({ error: "Solo se permiten archivos PNG, SVG o WEBP" }, { status: 400 })
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo no puede superar 2MB" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
    }

    // Service role SOLO para el upload de Storage (RLS de storage.objects
    // bloquea uploads de usuarios; mismo patrón que /api/documents/upload).
    // El acceso ya está autorizado arriba: user autenticado + su propio org_id.
    const storageClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const fileName = `logos/${user.org_id}-${Date.now()}.${ext}`
    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await storageClient.storage
      .from("documents")
      .upload(fileName, fileBuffer, { contentType: file.type, cacheControl: "3600", upsert: false })

    if (uploadError) {
      console.error("Error subiendo logo a Storage:", uploadError)
      return NextResponse.json(
        { error: `Error al subir el logo: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: urlData } = storageClient.storage.from("documents").getPublicUrl(fileName)
    const publicUrl = urlData.publicUrl

    // El setting se guarda con el server client del user + org_id explícito
    const supabase = await createServerClient()
    const { error: settingError } = await (supabase.from("organization_settings") as any)
      .upsert(
        [{ org_id: user.org_id, key: "brand_logo", value: publicUrl, updated_at: new Date().toISOString() }],
        { onConflict: "org_id,key" }
      )

    if (settingError) {
      console.error("Error guardando brand_logo:", settingError)
      await storageClient.storage.from("documents").remove([fileName])
      return NextResponse.json({ error: "Error al guardar el logo" }, { status: 500 })
    }

    return NextResponse.json({ data: { url: publicUrl } })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("Error in POST /api/settings/organization/logo:", error)
    return NextResponse.json({ error: "Error al subir el logo" }, { status: 500 })
  }
}
