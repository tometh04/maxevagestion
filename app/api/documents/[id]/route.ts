import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: documentId } = await params
    
    if (!documentId) {
      return NextResponse.json({ error: "ID del documento requerido" }, { status: 400 })
    }

    // Usar service role key para bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Obtener el documento para saber la ruta del archivo
    const { data: document, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single()

    if (fetchError || !document) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
    }

    const doc = document as any

    // Intentar eliminar el archivo de storage
    if (doc.file_url) {
      try {
        // Extraer el path del archivo desde la URL
        const urlParts = doc.file_url.split("/documents/")
        if (urlParts.length > 1) {
          const filePath = urlParts[1]
          await supabase.storage.from("documents").remove([filePath])
          console.log(`✅ Archivo eliminado de storage: ${filePath}`)
        }
      } catch (storageError) {
        console.error("Error eliminando archivo de storage:", storageError)
        // Continuar aunque falle la eliminación del archivo
      }
    }

    // Eliminar el registro del documento
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)

    if (deleteError) {
      console.error("Error eliminando documento:", deleteError)
      return NextResponse.json({ error: "Error al eliminar documento" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/documents/[id]:", error)
    return NextResponse.json({ 
      error: `Error al eliminar documento: ${error.message || "Error desconocido"}` 
    }, { status: 500 })
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: documentId } = await params
    
    const supabase = await createServerClient()

    const { data: document, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single()

    if (error || !document) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ document })
  } catch (error: any) {
    console.error("Error in GET /api/documents/[id]:", error)
    return NextResponse.json({ error: "Error al obtener documento" }, { status: 500 })
  }
}

