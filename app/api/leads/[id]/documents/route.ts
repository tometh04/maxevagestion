import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

/**
 * GET /api/leads/[id]/documents
 * Obtener todos los documentos de un lead
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: leadId } = await params
    
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

    // Verificar que el lead existe
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    // Obtener documentos del lead
    // Intentar primero con lead_id, si falla puede ser que la migración no se ejecutó
    let documents: any[] = []
    let docsError: any = null
    
    try {
      const result = await supabase
        .from("documents")
        .select("*, users:uploaded_by_user_id(id, name, email)")
        .eq("lead_id", leadId)
        .order("uploaded_at", { ascending: false })
      
      documents = result.data || []
      docsError = result.error
    } catch (error: any) {
      // Si falla, puede ser que la columna lead_id no existe
      if (error.message?.includes("column") && error.message?.includes("lead_id")) {
        console.warn("⚠️ Columna lead_id no existe, la migración no se ejecutó")
        return NextResponse.json({ 
          error: "La migración 027_add_lead_documents.sql no se ha ejecutado. Por favor, ejecútala en Supabase.",
          documents: []
        }, { status: 500 })
      }
      docsError = error
    }

    if (docsError) {
      console.error("❌ Error fetching documents:", docsError)
      // Verificar si el error es porque falta la columna lead_id
      if (docsError.message?.includes("column") && docsError.message?.includes("lead_id")) {
        return NextResponse.json({ 
          error: "La migración no se ha ejecutado. Por favor, ejecuta la migración 027_add_lead_documents.sql en Supabase.",
          documents: [] 
        }, { status: 500 })
      }
      return NextResponse.json({ 
        error: `Error al obtener documentos: ${docsError.message || "Error desconocido"}`,
        documents: []
      }, { status: 500 })
    }

    return NextResponse.json({ documents: documents || [] })
  } catch (error) {
    console.error("Error in GET /api/leads/[id]/documents:", error)
    return NextResponse.json({ error: "Error al obtener documentos" }, { status: 500 })
  }
}

