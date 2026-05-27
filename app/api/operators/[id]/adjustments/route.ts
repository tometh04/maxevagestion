import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/operators/[id]/adjustments
 * Lista los ajustes/créditos del operador.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización" }, { status: 400 })
    }

    const { id: operatorId } = await params
    const supabase = await createServerClient()

    // Verificar que el operador pertenece a la org
    const { data: operator } = await supabase
      .from("operators")
      .select("id")
      .eq("id", operatorId)
      .eq("org_id", user.org_id)
      .single()

    if (!operator) {
      return NextResponse.json({ error: "Operador no encontrado" }, { status: 404 })
    }

    const { data, error } = await (supabase as any)
      .from("operator_adjustments")
      .select("id, amount, currency, reason, created_at, created_by, users:created_by(name)")
      .eq("operator_id", operatorId)
      .eq("org_id", user.org_id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching operator adjustments:", error)
      return NextResponse.json({ error: "Error al obtener ajustes" }, { status: 500 })
    }

    return NextResponse.json({ adjustments: data || [] })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in GET /api/operators/[id]/adjustments:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

/**
 * POST /api/operators/[id]/adjustments
 * Crea un ajuste/crédito para el operador. Solo SUPER_ADMIN y ORG_OWNER.
 *
 * Body: { amount: number, currency: "USD"|"ARS", reason: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización" }, { status: 400 })
    }

    // Solo SUPER_ADMIN y ORG_OWNER pueden crear ajustes
    if (user.role !== "SUPER_ADMIN" && user.role !== "ORG_OWNER") {
      return NextResponse.json(
        { error: "Solo administradores pueden registrar ajustes de operador" },
        { status: 403 }
      )
    }

    const { id: operatorId } = await params
    const body = await request.json()

    const { amount, currency, reason } = body

    // Validaciones
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser un número positivo" }, { status: 400 })
    }
    if (!currency || !["USD", "ARS"].includes(currency)) {
      return NextResponse.json({ error: "La moneda debe ser USD o ARS" }, { status: 400 })
    }
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return NextResponse.json({ error: "El motivo es obligatorio (mínimo 3 caracteres)" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Verificar que el operador pertenece a la org
    const { data: operator } = await supabase
      .from("operators")
      .select("id, name")
      .eq("id", operatorId)
      .eq("org_id", user.org_id)
      .single()

    if (!operator) {
      return NextResponse.json({ error: "Operador no encontrado" }, { status: 404 })
    }

    const { data: adjustment, error } = await (supabase as any)
      .from("operator_adjustments")
      .insert({
        org_id: user.org_id,
        operator_id: operatorId,
        amount: Math.round(amount * 100) / 100,
        currency: currency.toUpperCase(),
        reason: reason.trim(),
        created_by: user.id,
      })
      .select("id, amount, currency, reason, created_at, created_by")
      .single()

    if (error) {
      console.error("Error creating operator adjustment:", error)
      return NextResponse.json({ error: "Error al crear ajuste" }, { status: 500 })
    }

    return NextResponse.json({ adjustment })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in POST /api/operators/[id]/adjustments:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
