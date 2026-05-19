import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * PATCH — Update a purchase invoice
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId, invoiceId } = await params
    const body = await request.json()
    const supabase = await createServerClient()

    // Cross-tenant fix (2026-05-18): validar operación del org del user.
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

    const updateData: any = { updated_at: new Date().toISOString() }
    const allowedFields = [
      "invoice_type", "invoice_number", "invoice_date",
      "emitter_cuit", "emitter_name", "operator_id",
      "currency", "net_amount", "iva_rate", "iva_amount",
      "perception_iva", "perception_iibb", "other_taxes", "total_amount",
      "exchange_rate", "total_ars_equivalent",
      "status", "notes",
    ]
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field]
    }

    const { data: invoice, error } = await (supabase.from("purchase_invoices") as any)
      .update(updateData)
      .eq("id", invoiceId)
      .eq("operation_id", operationId)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update tax_withholdings if percepciones changed
    if (body.perception_iva !== undefined || body.perception_iibb !== undefined) {
      const taxPeriod = (invoice.invoice_date || "").substring(0, 7)

      // Update/create percepcion IVA
      if (body.perception_iva !== undefined) {
        await (supabase.from("tax_withholdings") as any)
          .delete()
          .eq("source_type", "PURCHASE_INVOICE")
          .eq("source_id", invoiceId)
          .eq("type", "PERCEPCION_IVA")

        if (body.perception_iva > 0) {
          await (supabase.from("tax_withholdings") as any).insert({
            type: "PERCEPCION_IVA", direction: "SUFFERED",
            source_type: "PURCHASE_INVOICE", source_id: invoiceId,
            operation_id: operationId, operator_id: invoice.operator_id,
            counterpart_cuit: invoice.emitter_cuit, counterpart_name: invoice.emitter_name,
            currency: invoice.currency, amount: body.perception_iva,
            tax_period: taxPeriod, withholding_date: invoice.invoice_date,
            status: "PENDING", created_by: user.id,
          })
        }
      }

      // Update/create percepcion IIBB
      if (body.perception_iibb !== undefined) {
        await (supabase.from("tax_withholdings") as any)
          .delete()
          .eq("source_type", "PURCHASE_INVOICE")
          .eq("source_id", invoiceId)
          .eq("type", "PERCEPCION_IIBB")

        if (body.perception_iibb > 0) {
          await (supabase.from("tax_withholdings") as any).insert({
            type: "PERCEPCION_IIBB", direction: "SUFFERED",
            source_type: "PURCHASE_INVOICE", source_id: invoiceId,
            operation_id: operationId, operator_id: invoice.operator_id,
            counterpart_cuit: invoice.emitter_cuit, counterpart_name: invoice.emitter_name,
            currency: invoice.currency, amount: body.perception_iibb,
            tax_period: taxPeriod, withholding_date: invoice.invoice_date,
            status: "PENDING", created_by: user.id,
          })
        }
      }
    }

    // Update iva_purchases with corrected amounts
    if (body.iva_amount !== undefined) {
      const { data: existingIva } = await (supabase.from("iva_purchases") as any)
        .select("id").eq("operation_id", operationId).maybeSingle()
      if (existingIva) {
        await (supabase.from("iva_purchases") as any).update({
          operator_cost_total: invoice.total_amount,
          net_amount: invoice.net_amount,
          iva_amount: invoice.iva_amount,
          updated_at: new Date().toISOString(),
        }).eq("id", existingIva.id)
      }
    }

    return NextResponse.json({ invoice })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE — Delete a purchase invoice and its associated withholdings
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId, invoiceId } = await params
    const supabase = await createServerClient()

    // Cross-tenant fix (2026-05-18): validar operación del org del user antes
    // de borrar la factura.
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

    // Delete associated tax withholdings first
    await (supabase.from("tax_withholdings") as any)
      .delete()
      .eq("source_type", "PURCHASE_INVOICE")
      .eq("source_id", invoiceId)

    // Delete the invoice
    const { error } = await (supabase.from("purchase_invoices") as any)
      .delete()
      .eq("id", invoiceId)
      .eq("operation_id", operationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
