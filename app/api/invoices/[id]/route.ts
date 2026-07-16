import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { canAccessModule } from "@/lib/permissions"

export const dynamic = "force-dynamic"

// GET - Obtener una factura individual (para pre-cargar una NC/ND)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para ver facturas" },
        { status: 403 }
      )
    }

    // Scope explícito por agencias del usuario (no confiar solo en RLS).
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    const { data: invoice, error } = await (supabase.from("invoices") as any)
      .select(`
        *,
        operations (id, file_code, destination),
        customers (id, first_name, last_name),
        invoice_items (*)
      `)
      .eq("id", id)
      .in("agency_id", agencyIds)
      .maybeSingle()

    if (error) {
      console.error("Error fetching invoice:", error)
      return NextResponse.json({ error: "Error al obtener factura" }, { status: 500 })
    }

    // 404 enmascarado: si no pertenece al scope del user, no confirmamos que existe.
    if (!invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error("Error in GET /api/invoices/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener factura" },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar una factura en estado BORRADOR (o rechazada) que NO tiene CAE.
//
// Invariante fiscal AFIP: una factura con CAE es un comprobante legalmente emitido
// y NUNCA se puede borrar (solo se revierte con Nota de Crédito). El guard duro es
// `cae IS NULL`: si la factura tiene CAE, se rechaza aunque el status sugiera otra cosa.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para eliminar facturas" },
        { status: 403 }
      )
    }

    // Cross-tenant fix: filtro explícito por org, no confiar en RLS.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    const { data: invoice, error: fetchError } = await (supabase.from("invoices") as any)
      .select("id, status, cae")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (fetchError) {
      console.error("Error fetching invoice for delete:", fetchError)
      return NextResponse.json({ error: "Error al obtener factura" }, { status: 500 })
    }

    // 404 enmascarado: no confirmar existencia de facturas de otros orgs.
    if (!invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    // Guard fiscal duro: si tiene CAE, es un comprobante emitido y no se borra.
    if (invoice.cae) {
      return NextResponse.json(
        { error: "No se puede eliminar una factura autorizada. Emití una Nota de Crédito para revertirla." },
        { status: 400 }
      )
    }

    // Solo borradores / rechazadas (comprobantes no fiscales, sin CAE).
    if (invoice.status !== "draft" && invoice.status !== "rejected") {
      return NextResponse.json(
        { error: `No se puede eliminar una factura en estado '${invoice.status}'` },
        { status: 400 }
      )
    }

    // invoice_items se borra en cascada (FK ON DELETE CASCADE, migration 067).
    const { error: deleteError } = await (supabase.from("invoices") as any)
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
      .is("cae", null)

    if (deleteError) {
      console.error("Error deleting invoice:", deleteError)
      return NextResponse.json({ error: "Error al eliminar factura" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/invoices/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al eliminar factura" },
      { status: 500 }
    )
  }
}
