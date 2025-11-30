import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params
    const tariffId = id

    const { data: tariff, error } = await (supabase.from("tariffs") as any)
      .select(`
        *,
        operators:operator_id(id, name, contact_email, contact_phone),
        agencies:agency_id(id, name),
        tariff_items(*),
        created_by_user:created_by(id, name)
      `)
      .eq("id", tariffId)
      .single()

    if (error || !tariff) {
      return NextResponse.json({ error: "Tarifario no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ tariff })
  } catch (error: any) {
    console.error("Error in GET /api/tariffs/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al obtener tarifario" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para actualizar tarifarios" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const tariffId = id
    const body = await request.json()

    // Prepare update data
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    const allowedFields = [
      "name",
      "description",
      "destination",
      "region",
      "valid_from",
      "valid_to",
      "tariff_type",
      "currency",
      "is_active",
      "notes",
      "terms_and_conditions",
    ]

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    })

    // Update tariff
    const { data: tariff, error } = await (supabase.from("tariffs") as any)
      .update(updateData)
      .eq("id", tariffId)
      .select()
      .single()

    if (error) {
      console.error("Error updating tariff:", error)
      return NextResponse.json({ error: "Error al actualizar tarifario" }, { status: 500 })
    }

    // Update items if provided
    if (body.items && Array.isArray(body.items)) {
      // Delete existing items
      await (supabase.from("tariff_items") as any).delete().eq("tariff_id", tariffId)

      // Insert new items
      if (body.items.length > 0) {
        const itemsData = body.items.map((item: any, index: number) => ({
          tariff_id: tariffId,
          category: item.category,
          room_type: item.room_type || null,
          occupancy_type: item.occupancy_type || null,
          base_price: item.base_price,
          price_per_night: item.price_per_night || false,
          price_per_person: item.price_per_person !== false,
          discount_percentage: item.discount_percentage || 0,
          commission_percentage: item.commission_percentage || 0,
          min_nights: item.min_nights || null,
          max_nights: item.max_nights || null,
          min_pax: item.min_pax || 1,
          max_pax: item.max_pax || null,
          is_available: item.is_available !== false,
          notes: item.notes || null,
          order_index: index,
        }))

        await (supabase.from("tariff_items") as any).insert(itemsData)
      }
    }

    // Fetch complete tariff
    const { data: completeTariff } = await (supabase.from("tariffs") as any)
      .select(`
        *,
        tariff_items(*)
      `)
      .eq("id", tariffId)
      .single()

    return NextResponse.json({ tariff: completeTariff })
  } catch (error: any) {
    console.error("Error in PATCH /api/tariffs/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar tarifario" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar tarifarios" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const tariffId = id

    // Check if tariff is being used in quotations
    const { data: quotations } = await (supabase.from("quotation_items") as any)
      .select("id")
      .eq("tariff_id", tariffId)
      .limit(1)

    if (quotations && quotations.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar un tarifario que está siendo usado en cotizaciones" },
        { status: 400 }
      )
    }

    // Delete tariff (items will be deleted by CASCADE)
    const { error } = await (supabase.from("tariffs") as any).delete().eq("id", tariffId)

    if (error) {
      console.error("Error deleting tariff:", error)
      return NextResponse.json({ error: "Error al eliminar tarifario" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/tariffs/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar tarifario" }, { status: 500 })
  }
}

