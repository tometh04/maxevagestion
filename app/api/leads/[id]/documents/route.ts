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
    let documents: any[] = []
    
    try {
      const result = await supabase
        .from("documents")
        .select("*, users:uploaded_by_user_id(id, name, email)")
        .eq("lead_id", leadId)
        .order("uploaded_at", { ascending: false })
      
      if (result.error) throw result.error
      documents = result.data || []
    } catch (error: any) {
      if (error.message?.includes("column") && error.message?.includes("lead_id")) {
        return NextResponse.json({ 
          error: "La migración 027_add_lead_documents.sql no se ha ejecutado.",
          documents: []
        }, { status: 500 })
      }
      throw error
    }

    // También obtener documentos de operaciones asociadas a este lead
    try {
      // Buscar operaciones que tengan este lead_id
      const { data: operations } = await supabase
        .from("operations")
        .select("id")
        .eq("lead_id", leadId)
      
      if (operations && operations.length > 0) {
        const operationIds = operations.map(op => op.id)
        
        const { data: opDocs } = await supabase
          .from("documents")
          .select("*, users:uploaded_by_user_id(id, name, email)")
          .in("operation_id", operationIds)
          .order("uploaded_at", { ascending: false })
        
        if (opDocs) {
          // Agregar documentos de operaciones que no estén ya en la lista
          for (const doc of opDocs) {
            if (!documents.find(d => d.id === doc.id)) {
              documents.push({ ...doc, fromOperation: true })
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching operation documents:", error)
      // No fallar si esto falla, los documentos del lead ya están
    }

    // Ordenar todos por fecha
    documents.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())

    return NextResponse.json({ documents })
  } catch (error) {
    console.error("Error in GET /api/leads/[id]/documents:", error)
    return NextResponse.json({ error: "Error al obtener documentos" }, { status: 500 })
  }
}

