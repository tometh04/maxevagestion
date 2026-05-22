import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * SaaS Pilar 2: itinerary_items tiene RLS permisiva (USING true) y no tiene
 * org_id — un agregado de Pilar 2c. Hasta que se migre la tabla, la defensa
 * está en código: validamos vía server client que la operation parent
 * pertenece al user (operations SÍ tiene RLS tenant_isolation).
 *
 * Cross-tenant fix (2026-05-18): además del fetch RLS, scopeamos por org_id
 * explícito — no confiamos en RLS solo.
 */
async function verifyOperationBelongsToUser(
  supabase: any,
  operationId: string,
  orgId: string | null
): Promise<boolean> {
  if (!orgId) return false
  const { data: operation } = await supabase
    .from("operations")
    .select("id")
    .eq("id", operationId)
    .eq("org_id", orgId)
    .maybeSingle()
  return !!operation
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver itinerarios" }, { status: 403 })
    }

    const { id: operationId } = await params
    const supabase = await createServerClient()

    if (!(await verifyOperationBelongsToUser(supabase, operationId, (user as any).org_id))) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const { data: items, error } = await (supabase.from("itinerary_items") as any)
      .select("*")
      .eq("operation_id", operationId)
      .order("sort_order", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ items: items || [] })
  } catch (error: any) {
    return NextResponse.json({ error: "Error al obtener itinerario" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear items de itinerario" }, { status: 403 })
    }

    const { id: operationId } = await params
    const body = await request.json()
    const supabase = await createServerClient()

    if (!(await verifyOperationBelongsToUser(supabase, operationId, (user as any).org_id))) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // adminDb justificado: itinerary_items no tiene org_id y RLS es permisiva
    // (USING true). La validación cross-tenant la hace verifyOperationBelongsToUser
    // arriba sobre la operation parent.
    const adminDb = createAdminClient() as any

    // Get max sort_order for this operation
    const { data: maxOrder } = await adminDb
      .from("itinerary_items")
      .select("sort_order")
      .eq("operation_id", operationId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()

    const nextOrder = (maxOrder?.sort_order ?? -1) + 1

    const { data: item, error } = await adminDb
      .from("itinerary_items")
      .insert({
        operation_id: operationId,
        sort_order: nextOrder,
        item_type: body.item_type,
        hotel_name: body.hotel_name || null,
        hotel_stars: body.hotel_stars || null,
        hotel_address: body.hotel_address || null,
        hotel_phone: body.hotel_phone || null,
        room_type: body.room_type || null,
        meal_plan: body.meal_plan || null,
        checkin_date: body.checkin_date || null,
        checkout_date: body.checkout_date || null,
        nights: body.nights || null,
        rooms: body.rooms || null,
        airline: body.airline || null,
        flight_route: body.flight_route || null,
        flight_date: body.flight_date || null,
        transfer_description: body.transfer_description || null,
        car_company: body.car_company || null,
        car_details: body.car_details || null,
        car_pickup_date: body.car_pickup_date || null,
        car_return_date: body.car_return_date || null,
        car_pickup_location: body.car_pickup_location || null,
        car_return_location: body.car_return_location || null,
        destination_city: body.destination_city || null,
        date_from: body.date_from || null,
        date_to: body.date_to || null,
        notes: body.notes || null,
        image_url: body.image_url || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ item })
  } catch (error: any) {
    return NextResponse.json({ error: "Error al crear item" }, { status: 500 })
  }
}
