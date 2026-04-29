import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeQuotationPricingMode } from "@/lib/quotations/presentation"
import {
  cleanupInsertedQuotationOptions,
  insertQuotationOptionsOrThrow,
  prepareQuotationOptionsForPersistence,
  QuotationStructurePersistenceError,
} from "@/lib/quotations/persistence"

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
    notes: quotation.notes,
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
      "notes", "terms_and_conditions", "status",
      "subtotal", "total_amount", "pricing_mode",
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (body.pricing_mode !== undefined) {
      updateData.pricing_mode = normalizeQuotationPricingMode(body.pricing_mode)
    }

    let preparedOptions: ReturnType<typeof prepareQuotationOptionsForPersistence> | null = null
    let existingOptionIds: string[] = []
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

      const { data: currentOptions, error: currentOptionsError } = await supabase
        .from("quotation_options")
        .select("id")
        .eq("quotation_id", id)

      if (currentOptionsError) {
        console.error("Error loading existing quotation options before PATCH:", currentOptionsError)
        return NextResponse.json({ error: "No se pudo preparar la actualización de la cotización" }, { status: 500 })
      }

      existingOptionIds = Array.isArray(currentOptions)
        ? currentOptions.map((option: { id: string }) => option.id)
        : []
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

    // Si se enviaron opciones nuevas, reemplazarlas sin descartar la estructura anterior hasta el final
    if (preparedOptions) {
      let insertedOptionIds: string[] = []

      try {
        const insertResult = await insertQuotationOptionsOrThrow({
          supabase,
          quotationId: id,
          currency: updated.currency || "USD",
          preparedOptions,
        })
        insertedOptionIds = insertResult.optionIds

        if (existingOptionIds.length > 0) {
          const { error: deleteOldOptionsError } = await supabase
            .from("quotation_options")
            .delete()
            .in("id", existingOptionIds)
            .eq("quotation_id", id)

          if (deleteOldOptionsError) {
            throw new QuotationStructurePersistenceError(
              "No se pudo reemplazar la estructura anterior de la cotización.",
              "old_options_delete_failed",
              {
                quotationId: id,
                oldOptionIds: existingOptionIds,
                cause: deleteOldOptionsError.message,
              }
            )
          }
        }

        const { error: orphanItemsError } = await supabase
          .from("quotation_items")
          .delete()
          .eq("quotation_id", id)
          .is("option_id", null)

        if (orphanItemsError) {
          throw new QuotationStructurePersistenceError(
            "No se pudieron limpiar ítems legacy de la cotización.",
            "orphan_items_delete_failed",
            {
              quotationId: id,
              cause: orphanItemsError.message,
            }
          )
        }
      } catch (error) {
        console.error("Error persisting quotation structure during PATCH:", {
          quotationId: id,
          quotationNumber: existing.quotation_number,
          ...getQuotationPersistenceLogContext(error),
        })

        if (insertedOptionIds.length > 0) {
          try {
            await cleanupInsertedQuotationOptions(supabase, insertedOptionIds, id)
          } catch (cleanupError) {
            console.error("Error cleaning up new quotation options after PATCH failure:", {
              quotationId: id,
              ...getQuotationPersistenceLogContext(cleanupError),
            })
          }
        }

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

        return NextResponse.json(
          { error: "No se pudo guardar la estructura completa de la cotización. Se conservaron los datos anteriores." },
          { status: 500 }
        )
      }
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
