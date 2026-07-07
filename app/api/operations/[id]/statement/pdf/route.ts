import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { buildOperationStatementData } from "@/lib/operations/statement-data"
import { generateOperationStatementPdf } from "@/lib/pdf/operation-statement-pdf"

/**
 * GET /api/operations/[id]/statement/pdf
 *
 * Descarga el "Detalle de la Operación" (Liquidación de Servicios) como PDF:
 * servicios contratados + importe total + fecha máxima de pago (vencimiento).
 * Es la base del adjunto que se manda por email (ver ../send) y sirve como
 * superficie de descarga manual / verificación.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params

    // Guard multi-tenant (regla de oro CLAUDE.md).
    if (!(user as any).org_id) {
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      )
    }
    if (!canPerformAction(user, "operations", "read")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const data = await buildOperationStatementData({
      supabase,
      operationId,
      orgId: (user as any).org_id,
    })

    // 404 enmascarado si la operación no existe o es de otro tenant.
    if (!data) {
      return NextResponse.json(
        { error: "Operación no encontrada" },
        { status: 404 }
      )
    }

    const pdfBuffer = generateOperationStatementPdf(data)

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="detalle-operacion-${data.fileCode}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("[statement/pdf] error:", error)
    return NextResponse.json(
      { error: "Error al generar el PDF" },
      { status: 500 }
    )
  }
}
