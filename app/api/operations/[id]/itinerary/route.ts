import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser()
    const { id: operationId } = await params
    const supabase = await createServerClient()

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
    await getCurrentUser()
    const { id: operationId } = await params
    const body = await request.json()
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
