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
