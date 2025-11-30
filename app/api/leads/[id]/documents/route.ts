import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

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
    const supabase = await createServerClient()

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
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*, users:uploaded_by_user_id(id, name, email)")
      .eq("lead_id", leadId)
      .order("uploaded_at", { ascending: false })

    if (docsError) {
      console.error("Error fetching documents:", docsError)
      return NextResponse.json({ error: "Error al obtener documentos" }, { status: 500 })
    }

    return NextResponse.json({ documents: documents || [] })
  } catch (error) {
    console.error("Error in GET /api/leads/[id]/documents:", error)
    return NextResponse.json({ error: "Error al obtener documentos" }, { status: 500 })
  }
}

