import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { canAccessDocumentResource } from "@/lib/permissions-api"

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
    const canDeleteDocument = await canAccessDocumentResource(
      supabase as any,
      user,
      {
        operationId: doc.operation_id,
        customerId: doc.customer_id,
      },
      { write: true }
    )

    if (!canDeleteDocument) {
      return NextResponse.json({ error: "No tiene permiso para eliminar este documento" }, { status: 403 })
    }

    // Intentar eliminar el archivo de storage
    if (doc.file_url) {
      try {
        // Extraer el path del archivo desde la URL
        const urlParts = doc.file_url.split("/documents/")
        if (urlParts.length > 1) {
          const filePath = urlParts[1]
          await supabase.storage.from("documents").remove([filePath])
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

    const { data: document, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single()

    if (error || !document) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
    }

    const canViewDocument = await canAccessDocumentResource(
      supabase as any,
      user,
      {
        operationId: (document as any).operation_id,
        customerId: (document as any).customer_id,
      }
    )

    if (!canViewDocument) {
      return NextResponse.json({ error: "No tiene permiso para ver este documento" }, { status: 403 })
    }

    return NextResponse.json({ document })
  } catch (error: any) {
    console.error("Error in GET /api/documents/[id]:", error)
    return NextResponse.json({ error: "Error al obtener documento" }, { status: 500 })
  }
}

