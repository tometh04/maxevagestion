import { NextResponse } from "next/server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  applyAgencyPermissionScope,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { withQuotationDocumentProjection } from "@/lib/quotations/document-projection"

export const dynamic = "force-dynamic"

// GET — Detalle de cotización con opciones e items
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    const { id } = await params
    const supabase: any = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "read")
    if (scope.memberAgencyIds.length === 0) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    const dataSupabase: any = createAdminClient()

    let detailQuery = dataSupabase
      .from("quotations")
      .select(`
        *,
        lead:lead_id(id, contact_name, contact_phone, contact_email, destination, status, contact_instagram),
        seller:seller_id(id, name, email),
        agency:agency_id(id, name),
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", id)
      .eq("org_id", user.org_id)
    detailQuery = applyAgencyPermissionScope(detailQuery, scope)
    const { data, error } = await detailQuery.maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    return NextResponse.json({
      data: withQuotationDocumentProjection(data),
    })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// DELETE — Eliminar cotización (solo borradores)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    const { id } = await params
    const supabase: any = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "delete")
    if (scope.memberAgencyIds.length === 0) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    const admin = createAdminClient() as any

    let deleteQuery = admin
      .from("quotations")
      .select("id, seller_id, status, agency_id")
      .eq("id", id)
      .eq("org_id", user.org_id)
    deleteQuery = applyAgencyPermissionScope(deleteQuery, scope)
    const { data: existing } = await deleteQuery.maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // Solo se pueden eliminar borradores
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar cotizaciones en estado DRAFT" },
        { status: 400 }
      )
    }

    // Un PDF emitido es evidencia comercial inmutable, aun cuando la
    // cotización siga en DRAFT. No intentamos borrarlo en cascada: conservamos
    // el historial y devolvemos un conflicto de negocio explícito.
    const { data: issuedDocument, error: issuedDocumentError } = await admin
      .from("issued_quotation_documents")
      .select("id")
      .eq("quotation_id", id)
      .eq("org_id", user.org_id)
      .eq("agency_id", existing.agency_id)
      .limit(1)
      .maybeSingle()

    if (issuedDocumentError) {
      console.error("Error checking issued quotation documents before delete:", issuedDocumentError)
      return NextResponse.json({ error: "No se pudo verificar el historial documental" }, { status: 500 })
    }

    if (issuedDocument) {
      return NextResponse.json(
        { error: "La cotización ya tiene un documento emitido y debe conservarse como historial" },
        { status: 409 }
      )
    }

    const { data: deleted, error } = await admin
      .from("quotations")
      .delete()
      .eq("id", id)
      .eq("org_id", user.org_id)
      .eq("agency_id", existing.agency_id)
      .eq("status", "DRAFT")
      .select("id")
      .maybeSingle()

    if (error?.code === "23503") {
      console.error("Quotation deletion blocked by related records:", { quotationId: id, error })
      return NextResponse.json(
        { error: "La cotización tiene registros relacionados que impiden eliminarla. Contactá a soporte." },
        { status: 409 }
      )
    }

    if (error) {
      console.error("Error deleting quotation:", { quotationId: id, error })
      return NextResponse.json({ error: "No se pudo eliminar la cotización. Intentá nuevamente." }, { status: 500 })
    }
    if (!deleted) {
      return NextResponse.json(
        { error: "La cotización cambió y ya no se puede eliminar" },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation DELETE:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
