import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"

/**
 * DELETE /api/leads/[id]/documents/[documentId]
 * Eliminar un documento
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: leadId, documentId } = await params
    
    // Usar service role key para bypass RLS (ya validamos autenticación arriba)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Faltan variables de entorno para Supabase")
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Verificar que el documento existe y pertenece al lead
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, file_url, lead_id")
      .eq("id", documentId)
      .eq("lead_id", leadId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
    }

    // Extraer nombre del archivo de la URL
    const fileUrl = (document as any).file_url
    const fileName = fileUrl.split("/documents/").pop()

    // Eliminar de Storage
    if (fileName) {
      await supabase.storage.from("documents").remove([fileName])
    }

    // Eliminar registro
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)

    if (deleteError) {
      console.error("Error deleting document:", deleteError)
      return NextResponse.json({ error: "Error al eliminar documento" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/leads/[id]/documents/[documentId]:", error)
    return NextResponse.json({ error: "Error al eliminar documento" }, { status: 500 })
  }
}

