import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeQuotationPricingMode } from "@/lib/quotations/presentation"
import { normalizeRegion } from "@/lib/manychat/sync"
import {
  prepareQuotationOptionsForPersistence,
  QuotationStructurePersistenceError,
  replaceQuotationStructure,
  snapshotQuotationStructure,
} from "@/lib/quotations/persistence"
import { logAudit, getClientIP } from "@/lib/audit"

export const dynamic = "force-dynamic"

function buildQuotationRestorePayload(quotation: any) {
  return {
    destination: quotation.destination,
    origin: quotation.origin,
    region: quotation.region,
    departure_date: quotation.departure_date,
    return_date: quotation.return_date,
    valid_until: quotation.valid_until,
    adults: quotation.adults,
    children: quotation.children,
    infants: quotation.infants,
    currency: quotation.currency,
    package_description: quotation.package_description,
    notes: quotation.notes,
    internal_notes: quotation.internal_notes,
    terms_and_conditions: quotation.terms_and_conditions,
    status: quotation.status,
    subtotal: quotation.subtotal,
    total_amount: quotation.total_amount,
    pricing_mode: quotation.pricing_mode,
    approved_by: quotation.approved_by,
    approved_at: quotation.approved_at,
    rejection_reason: quotation.rejection_reason,
  }
}

function getQuotationPersistenceLogContext(error: unknown) {
  if (error instanceof QuotationStructurePersistenceError) {
    return error.context
  }

  if (error instanceof Error) {
    return { cause: error.message }
  }

  return {}
}

// GET — Detalle de cotización con opciones e items
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase: any = await createServerClient()

    const { data, error } = await supabase
      .from("quotations")
      .select(`
        *,
        lead:lead_id(id, contact_name, contact_phone, contact_email, destination, status, contact_instagram),
        seller:seller_id(id, name, email),
        agency:agency_id(id, name),
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // SELLER solo ve las suyas
    if (user.role === "SELLER" && data.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso" }, { status: 403 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// PATCH — Actualizar cotización (datos, estado, opciones)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase: any = await createServerClient()
    const body = await request.json()

    // Verificar que existe y que el usuario tiene acceso
    const { data: existing } = await supabase
      .from("quotations")
      .select("*")
      .eq("id", id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    if (user.role === "SELLER" && existing.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso" }, { status: 403 })
    }

    if (body.lead_id !== undefined && body.lead_id !== existing.lead_id) {
      return NextResponse.json(
        { error: "La cotización no pertenece al lead indicado" },
        { status: 409 }
      )
    }

    // Campos actualizables
    const updateData: Record<string, any> = {}
    const allowedFields = [
      "destination", "origin", "region", "departure_date", "return_date",
      "valid_until", "adults", "children", "infants", "currency",
      "package_description", "notes", "internal_notes",
      "terms_and_conditions", "status",
      "subtotal", "total_amount", "pricing_mode",
      // El POST de creación lo persiste; faltaba acá, así que cada edición lo
      // descartaba en silencio.
      "payment_methods",
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (body.pricing_mode !== undefined) {
      updateData.pricing_mode = normalizeQuotationPricingMode(body.pricing_mode)
    }

    // quotations.region tiene CHECK legacy de 7 valores pero las regiones de
    // leads son configurables por org → normalizar (custom → inferida del
    // destino u OTROS) para no violar quotations_region_check.
    if (body.region !== undefined) {
      updateData.region = normalizeRegion(body.region, body.destination ?? existing.destination)
    }

    let preparedOptions: ReturnType<typeof prepareQuotationOptionsForPersistence> | null = null
    let structureSnapshot: { options: any[]; items: any[] } = { options: [], items: [] }
    if (body.options && Array.isArray(body.options)) {
      try {
        preparedOptions = prepareQuotationOptionsForPersistence(body.options, body.currency || existing.currency || "USD")
      } catch (error: any) {
        return NextResponse.json({ error: error.message || "Opciones inválidas" }, { status: 400 })
      }

      if (preparedOptions.length === 0) {
        return NextResponse.json({ error: "Se requiere al menos una opción válida" }, { status: 400 })
      }

      updateData.subtotal = preparedOptions[0].total_amount
      updateData.total_amount = preparedOptions[0].total_amount

      try {
        structureSnapshot = await snapshotQuotationStructure(supabase, id)
      } catch (error) {
        console.error("Error loading existing quotation structure before PATCH:", {
          quotationId: id,
          ...getQuotationPersistenceLogContext(error),
        })
        return NextResponse.json({ error: "No se pudo preparar la actualización de la cotización" }, { status: 500 })
      }

      // Un cliente que no hidrató las opciones existentes manda su placeholder
      // (una sola opción en blanco) y el guard de `length === 0` no lo frena.
      // Si la cantidad se achica sin que el usuario lo haya pedido explícito,
      // frenamos en vez de destruir la estructura.
      if (
        structureSnapshot.options.length > preparedOptions.length &&
        body.options_replace !== true
      ) {
        return NextResponse.json(
          {
            error:
              `La cotización tiene ${structureSnapshot.options.length} opciones y se recibieron ${preparedOptions.length}. ` +
              "Recargá la cotización antes de guardar para no perder opciones.",
          },
          { status: 409 }
        )
      }
    }

    // Lógica de cambio de estado
    if (body.status === "SENT" && existing.status === "DRAFT") {
      updateData.status = "SENT"
    }

    if (body.status === "APPROVED") {
      updateData.status = "APPROVED"
      updateData.approved_by = user.id
      updateData.approved_at = new Date().toISOString()
    }

    if (body.status === "REJECTED") {
      updateData.status = "REJECTED"
      updateData.rejection_reason = body.rejection_reason || null
    }

    if (!existing.public_token && (preparedOptions || Object.keys(updateData).length > 0)) {
      updateData.public_token = randomUUID()
    }

    // Actualizar cotización
    const { data: updated, error } = await supabase
      .from("quotations")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating quotation:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Reemplazo de la estructura (opciones + items).
    //
    // Historia: hasta 2026-05-26 se insertaba antes de borrar, y el unique de
    // (quotation_id, option_number) hacía fallar el insert. Se invirtió a
    // delete → insert, lo que dejó una ventana en la que un insert fallido
    // destruía la estructura para siempre (el rollback sólo reponía el header).
    // Hoy replaceQuotationStructure() lo hace en una sola transacción vía RPC,
    // con el camino legacy + restore del snapshot como fallback.
    if (preparedOptions) {
      try {
        await replaceQuotationStructure({
          supabase,
          quotationId: id,
          currency: updated.currency || "USD",
          preparedOptions,
          orgId: existing.org_id ?? user.org_id ?? null,
          snapshot: structureSnapshot,
        })
      } catch (error) {
        console.error("Error persisting quotation structure during PATCH:", {
          quotationId: id,
          quotationNumber: existing.quotation_number,
          ...getQuotationPersistenceLogContext(error),
        })

        const { error: restoreError } = await supabase
          .from("quotations")
          .update(buildQuotationRestorePayload(existing))
          .eq("id", id)

        if (restoreError) {
          console.error("Error restoring quotation header after PATCH failure:", {
            quotationId: id,
            cause: restoreError.message,
          })
        }

        logAudit(supabase, {
          user_id: user.id,
          user_email: user.email,
          action: "UPDATE",
          entity_type: "quotation",
          entity_id: id,
          details: {
            failed: true,
            quotation_number: existing.quotation_number,
            previous_structure: structureSnapshot,
          },
          ip_address: getClientIP(request) || undefined,
        })

        return NextResponse.json(
          { error: "No se pudo guardar la estructura completa de la cotización. Se conservaron los datos anteriores." },
          { status: 500 }
        )
      }

      // Auditoría con la estructura anterior: si algo la borra, esto es lo
      // único con lo que se puede reconstruir (ver el caso de operation_legs).
      logAudit(supabase, {
        user_id: user.id,
        user_email: user.email,
        action: "UPDATE",
        entity_type: "quotation",
        entity_id: id,
        details: {
          quotation_number: existing.quotation_number,
          previous_option_count: structureSnapshot.options.length,
          new_option_count: preparedOptions.length,
          previous_structure: structureSnapshot,
        },
        ip_address: getClientIP(request) || undefined,
      })
    }

    // Devolver cotización actualizada completa
    const { data: fullQuotation } = await supabase
      .from("quotations")
      .select(`
        *,
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", id)
      .single()

    return NextResponse.json({ data: fullQuotation })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation PATCH:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// DELETE — Eliminar cotización (solo borradores)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase: any = await createServerClient()

    const { data: existing } = await supabase
      .from("quotations")
      .select("id, seller_id, status")
      .eq("id", id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    if (user.role === "SELLER" && existing.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso" }, { status: 403 })
    }

    // Solo se pueden eliminar borradores
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar cotizaciones en estado DRAFT" },
        { status: 400 }
      )
    }

    const { error } = await supabase.from("quotations").delete().eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation DELETE:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
