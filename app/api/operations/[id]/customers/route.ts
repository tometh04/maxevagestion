import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import {
  normalizeOperationPassengers,
  findCustomersOutsideOrg,
} from "@/lib/operations/operation-passengers"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params
    const supabase = await createServerClient()

    // Cross-tenant fix (2026-05-18): validar que la operación sea del org del user.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { data: opOwner } = await (supabase.from("operations") as any)
      .select("id")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .maybeSingle()
    if (!opOwner) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("operation_customers")
      .select(`
        id,
        operation_id,
        customer_id,
        role,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .eq("operation_id", operationId)

    if (error) {
      console.error("Error fetching operation customers:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ customers: data || [] })
  } catch (error: any) {
    console.error("Error in GET /api/operations/[id]/customers:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { id: operationId } = await params
    const supabase = await createServerClient()
    const body = await request.json()

    const { customer_id, role } = body
    // VIB-106: además del alta de a uno, se acepta una lista de pasajeros para
    // poder cargarlos todos juntos. El shape de respuesta del modo de a uno se
    // mantiene igual porque lo consume `passengers-section.tsx`.
    const isBulk = Array.isArray(body?.passengers)

    if (!isBulk && !customer_id) {
      return NextResponse.json({ error: "customer_id es requerido" }, { status: 400 })
    }

    // Cross-tenant fix (2026-05-18): validar que la operación sea del org del user
    // antes de permitir agregar un cliente a ella.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string
    const { data: opOwner } = await (supabase.from("operations") as any)
      .select("id")
      .eq("id", operationId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!opOwner) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const normalized = normalizeOperationPassengers({
      passengers: isBulk ? body.passengers : [{ customer_id, role }],
    })
    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }
    // En este endpoint el rol lo decide el caller (se agrega sobre una operación
    // que ya puede tener titular), así que no se promueve nadie a MAIN: se lee
    // el rol pedido por customer_id (el normalizador dedupe, así que no se puede
    // parear por índice contra el payload crudo).
    const requestedRoles = new Map<string, string>()
    for (const entry of (isBulk ? body.passengers : [{ customer_id, role }]) as any[]) {
      const id = typeof entry === "string" ? entry : entry?.customer_id
      if (typeof id === "string" && id.trim() && !requestedRoles.has(id.trim())) {
        requestedRoles.set(id.trim(), entry?.role)
      }
    }
    const incoming = normalized.rows.map((row) => ({
      customer_id: row.customer_id,
      role: requestedRoles.get(row.customer_id) === "MAIN" ? "MAIN" : "COMPANION",
    }))
    if (incoming.length === 0) {
      return NextResponse.json({ error: "No hay pasajeros para agregar" }, { status: 400 })
    }
    if (incoming.filter((p) => p.role === "MAIN").length > 1) {
      return NextResponse.json({ error: "Solo puede haber un pasajero principal" }, { status: 400 })
    }

    // 🔴 Cross-tenant: la RLS NO alcanza acá. El trigger de auto org_id rellena
    // `operation_customers.org_id` con la org del que inserta, así que un
    // customer_id de otra org pasaría el WITH CHECK y quedaría linkeado.
    const foreignCustomers = await findCustomersOutsideOrg(
      supabase,
      incoming.map((p) => p.customer_id),
      orgId
    )
    if (foreignCustomers.length > 0) {
      return NextResponse.json(
        { error: "Uno o más clientes no pertenecen a tu organización" },
        { status: 400 }
      )
    }

    // Estado actual de la operación en una sola query (duplicados + MAIN existente).
    const { data: existingRows } = await (supabase.from("operation_customers") as any)
      .select("customer_id, role")
      .eq("operation_id", operationId)

    const existingIds = new Set(((existingRows as any[]) || []).map((r) => r.customer_id))
    const duplicated = incoming.filter((p) => existingIds.has(p.customer_id))
    if (duplicated.length > 0) {
      return NextResponse.json(
        {
          error:
            duplicated.length === 1
              ? "El cliente ya está en esta operación"
              : `${duplicated.length} de los clientes ya están en esta operación`,
        },
        { status: 400 }
      )
    }

    const hasMain = ((existingRows as any[]) || []).some((r) => r.role === "MAIN")
    if (hasMain && incoming.some((p) => p.role === "MAIN")) {
      return NextResponse.json({ error: "Ya existe un pasajero principal" }, { status: 400 })
    }

    // Un solo INSERT con array: PostgREST lo manda como una sentencia, así que
    // es todo-o-nada sin necesidad de transacción explícita.
    const { data, error } = await (supabase.from("operation_customers") as any)
      .insert(incoming.map((p) => ({ operation_id: operationId, ...p })))
      .select()

    if (error) {
      console.error("Error creating operation customer:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const inserted = (data as any[]) || []
    return NextResponse.json(
      isBulk ? { operationCustomers: inserted } : { operationCustomer: inserted[0] ?? null },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error in POST /api/operations/[id]/customers:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

