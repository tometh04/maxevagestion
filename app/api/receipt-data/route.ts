import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { buildReceiptPdfData } from "@/lib/receipts/receipt-pdf-data"

// API para obtener datos del recibo - genera PDF en el cliente.
// La lógica vive en buildReceiptPdfData (reusada por el envío por email).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get("paymentId")

    if (!paymentId) {
      return NextResponse.json({ error: "ID de pago requerido" }, { status: 400 })
    }

    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const result = await buildReceiptPdfData({
      supabase,
      paymentId,
      orgId: user.org_id,
      user: { id: user.id, role: user.role as string },
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, paymentId }, { status: result.status })
    }

    return NextResponse.json(result.data)
  } catch (error: any) {
    console.error("Error fetching receipt data:", error)
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 })
  }
}
