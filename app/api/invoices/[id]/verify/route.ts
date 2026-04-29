import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * POST /api/invoices/[id]/verify
 *
 * Re-verifica on-demand una factura ya autorizada contra AFIP.
 * Útil para detectar cambios desde AFIP o confirmar estado manual.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const { data: invoice } = await (supabase
      .from("invoices") as any)
      .select("id, org_id, cbte_nro, status")
      .eq("id", id)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    if (!invoice.cbte_nro) {
      return NextResponse.json(
        { error: "Factura aún no autorizada, no se puede verificar" },
        { status: 400 }
      )
    }

    const afipService = await getAfipServiceForOrg(supabase, invoice.org_id)
    if (!afipService) {
      return NextResponse.json({ error: "AFIP no configurado" }, { status: 400 })
    }

    const result = await afipService.verifyVoucher(id)
    return NextResponse.json({
      success: true,
      verification_status: result.verification_status,
      diff: result.diff,
      last_sync_at: result.last_sync_at,
    })
  } catch (error: any) {
    console.error("Error in POST /api/invoices/[id]/verify:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
