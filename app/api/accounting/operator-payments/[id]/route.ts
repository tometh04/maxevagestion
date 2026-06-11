import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const { id } = await params
    const body = await request.json()

    // Solo permitir actualizar due_date por este endpoint.
    // Otros campos (amount, paid_amount, status) tienen sus propios flujos auditados.
    if (!("due_date" in body)) {
      return NextResponse.json({ error: "Solo se permite actualizar due_date" }, { status: 400 })
    }

    const dueDate = body.due_date as string | null
    if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ error: "Formato de fecha inválido (esperado YYYY-MM-DD)" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Cross-tenant: verificar que el operator_payment pertenece al org del user.
    const { data, error } = await (supabase
      .from("operator_payments") as any)
      .update({ due_date: dueDate })
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .select("id, due_date")
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "No encontrado o sin permisos" }, { status: 404 })
    }

    return NextResponse.json({ id: data.id, due_date: data.due_date })
  } catch (error: any) {
    console.error("[operator-payments/[id]] PATCH error:", error)
    return NextResponse.json({ error: error?.message || "Error al actualizar" }, { status: 500 })
  }
}
