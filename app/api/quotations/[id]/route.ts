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
    const quotationId = id

    const { data: quotation, error } = await (supabase.from("quotations") as any)
      .select(`
        *,
        leads:lead_id(id, contact_name, destination, status, contact_phone, contact_email),
        agencies:agency_id(id, name),
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name),
        operations:operation_id(id, destination, status),
        created_by_user:created_by(id, name, email),
        approved_by_user:approved_by(id, name, email),
        quotation_items(*, tariffs:tariff_id(id, name))
      `)
      .eq("id", quotationId)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // Check permissions
    const quot = quotation as any
    if (user.role === "SELLER" && quot.seller_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    return NextResponse.json({ quotation })
  } catch (error: any) {
    console.error("Error in GET /api/quotations/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al obtener cotización" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para actualizar cotizaciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const quotationId = id
    const body = await request.json()

    // Get current quotation
    const { data: currentQuotation } = await supabase
      .from("quotations")
      .select("*")
      .eq("id", quotationId)
      .single()

    if (!currentQuotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    const curr = currentQuotation as any

    // Check permissions
    if (user.role === "SELLER" && curr.seller_id !== user.id) {
      return NextResponse.json({ error: "No puedes actualizar cotizaciones de otros vendedores" }, { status: 403 })
    }

    // Prepare update data
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Allow updating these fields
    const allowedFields = [
      "operator_id",
      "destination",
      "origin",
      "region",
      "departure_date",
      "return_date",
      "valid_until",
      "adults",
      "children",
      "infants",
      "subtotal",
      "discounts",
      "taxes",
      "total_amount",
      "currency",
      "notes",
      "terms_and_conditions",
      "status",
    ]

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    })

    // Handle status changes
    if (body.status) {
      if (body.status === "APPROVED") {
        updateData.approved_by = user.id
        updateData.approved_at = new Date().toISOString()
      } else if (body.status === "REJECTED") {
        updateData.rejection_reason = body.rejection_reason || null
      }
    }

    // Update quotation
    const { data: quotation, error } = await (supabase.from("quotations") as any)
      .update(updateData)
      .eq("id", quotationId)
      .select()
      .single()

    if (error) {
      console.error("Error updating quotation:", error)
      return NextResponse.json({ error: "Error al actualizar cotización" }, { status: 500 })
    }

    // Update items if provided
    if (body.items && Array.isArray(body.items)) {
      // Delete existing items
      await (supabase.from("quotation_items") as any).delete().eq("quotation_id", quotationId)

      // Insert new items
      if (body.items.length > 0) {
        const itemsData = body.items.map((item: any, index: number) => ({
          quotation_id: quotationId,
          item_type: item.item_type,
          description: item.description,
          quantity: item.quantity || 1,
          tariff_id: item.tariff_id || null,
          unit_price: item.unit_price,
          discount_percentage: item.discount_percentage || 0,
          discount_amount: item.discount_amount || 0,
          subtotal: item.subtotal || item.unit_price * (item.quantity || 1),
          currency: item.currency || quotation.currency || "ARS",
          notes: item.notes || null,
          order_index: index,
        }))

        await (supabase.from("quotation_items") as any).insert(itemsData)
      }
    }

    // Fetch complete quotation
    const { data: completeQuotation } = await (supabase.from("quotations") as any)
      .select(`
        *,
        quotation_items(*)
      `)
      .eq("id", quotationId)
      .single()

    return NextResponse.json({ quotation: completeQuotation })
  } catch (error: any) {
    console.error("Error in PATCH /api/quotations/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar cotización" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar cotizaciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const quotationId = id

    // Get current quotation
    const { data: currentQuotation } = await supabase
      .from("quotations")
      .select("*")
      .eq("id", quotationId)
      .single()

    if (!currentQuotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    const curr = currentQuotation as any

    // Check permissions
    if (user.role === "SELLER" && curr.seller_id !== user.id) {
      return NextResponse.json({ error: "No puedes eliminar cotizaciones de otros vendedores" }, { status: 403 })
    }

    // Only allow deletion of DRAFT or REJECTED quotations
    if (curr.status !== "DRAFT" && curr.status !== "REJECTED" && curr.status !== "EXPIRED") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar cotizaciones en estado DRAFT, REJECTED o EXPIRED" },
        { status: 400 }
      )
    }

    // Delete quotation (items will be deleted by CASCADE)
    const { error } = await (supabase.from("quotations") as any).delete().eq("id", quotationId)

    if (error) {
      console.error("Error deleting quotation:", error)
      return NextResponse.json({ error: "Error al eliminar cotización" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/quotations/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar cotización" }, { status: 500 })
  }
}

