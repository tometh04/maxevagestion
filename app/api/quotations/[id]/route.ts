import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeQuotationPricingMode } from "@/lib/quotations/presentation"
import { normalizeRegion } from "@/lib/manychat/sync"
import {
  prepareQuotationOptionsForPersistence,
  QuotationStructurePersistenceError,
  snapshotQuotationStructure,
  updateQuotationHeader,
  updateQuotationWithStructure,
} from "@/lib/quotations/persistence"
import { logAudit, getClientIP } from "@/lib/audit"
import { quotationPresentationContentSchema } from "@/lib/quotation-documents/schemas"
import {
  applyAgencyPermissionScope,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { isQuotationContentEditable } from "@/lib/quotations/lifecycle"
import { withQuotationDocumentProjection } from "@/lib/quotations/document-projection"

export const dynamic = "force-dynamic"

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
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    const { id } = await params
    const supabase: any = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "read")
    if (scope.memberAgencyIds.length === 0) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    const dataSupabase: any = createAdminClient()

    let detailQuery = dataSupabase
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
      .eq("org_id", user.org_id)
    detailQuery = applyAgencyPermissionScope(detailQuery, scope)
    const { data, error } = await detailQuery.maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    let operatorsQuery = dataSupabase
      .from("operators")
      .select("id, name")
      .eq("org_id", user.org_id)
      .order("name")
    operatorsQuery = data.agency_id
      ? operatorsQuery.or(`agency_id.is.null,agency_id.eq.${data.agency_id}`)
      : operatorsQuery.is("agency_id", null)
    const { data: availableOperators, error: operatorsError } = await operatorsQuery
    if (operatorsError) {
      console.error("Error loading quotation operators:", operatorsError)
      return NextResponse.json({ error: "No se pudieron cargar los operadores" }, { status: 500 })
    }

    return NextResponse.json({
      data: withQuotationDocumentProjection({
        ...data,
        available_operators: availableOperators || [],
      }),
    })
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
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    const { id } = await params
    const supabase: any = await createServerClient()
    const body = await request.json()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "write")
    if (scope.memberAgencyIds.length === 0) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    const admin = createAdminClient() as any

    // Verificar que existe y que el usuario tiene acceso
    let existingQuery = admin
      .from("quotations")
      .select("*")
      .eq("id", id)
      .eq("org_id", user.org_id)
    existingQuery = applyAgencyPermissionScope(existingQuery, scope)
    const { data: existing } = await existingQuery.maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    if (typeof body.expected_updated_at !== "string" || !body.expected_updated_at) {
      return NextResponse.json(
        { error: "expected_updated_at es requerido para editar la cotización" },
        { status: 400 }
      )
    }
    if (existing.updated_at !== body.expected_updated_at) {
      return NextResponse.json(
        { error: "La cotización cambió mientras la editabas. Recargala antes de volver a guardar." },
        { status: 409 }
      )
    }

    if (!isQuotationContentEditable(existing.status)) {
      return NextResponse.json(
        { error: "La cotización está cerrada y ya no admite edición" },
        { status: 409 }
      )
    }
    if (body.status !== undefined && body.status !== existing.status) {
      return NextResponse.json(
        { error: "Los cambios de estado deben realizarse desde la acción correspondiente" },
        { status: 400 }
      )
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
      "terms_and_conditions",
      "pricing_mode",
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

    if (body.presentation_content !== undefined) {
      const presentationContent = quotationPresentationContentSchema.safeParse(body.presentation_content)
      if (!presentationContent.success) {
        return NextResponse.json(
          { error: "El contenido comercial de la cotización no es válido", issues: presentationContent.error.issues },
          { status: 400 }
        )
      }
      updateData.presentation_content = presentationContent.data
      updateData.presentation_schema_version = presentationContent.data.schemaVersion
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
        structureSnapshot = await snapshotQuotationStructure(admin, id)
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

    const hasRequestedChanges = Boolean(preparedOptions) || Object.keys(updateData).length > 0
    if (!existing.public_token && hasRequestedChanges) {
      updateData.public_token = randomUUID()
    }

    // Encabezado, opciones e ítems se confirman en la misma transacción. El CAS
    // impide que dos editores mezclen el encabezado de una versión con la
    // estructura de otra; cualquier error deja intacta la cotización anterior.
    if (preparedOptions) {
      try {
        await updateQuotationWithStructure({
          supabase: admin,
          quotationId: id,
          currency: updateData.currency || existing.currency || "USD",
          preparedOptions,
          orgId: user.org_id,
          expectedUpdatedAt: body.expected_updated_at,
          actorId: user.id,
          agencyId: existing.agency_id,
          header: updateData,
        })
      } catch (error) {
        console.error("Error persisting quotation atomically during PATCH:", {
          quotationId: id,
          quotationNumber: existing.quotation_number,
          ...getQuotationPersistenceLogContext(error),
        })

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

        const persistenceCode = error instanceof QuotationStructurePersistenceError
          ? error.code
          : "atomic_update_failed"
        const status = persistenceCode === "quotation_changed" || persistenceCode === "invalid_state"
          ? 409
          : persistenceCode === "invalid_payload"
            ? 400
            : 500
        return NextResponse.json(
          {
            error: persistenceCode === "quotation_changed"
              ? "La cotización cambió mientras la editabas. Recargala antes de volver a guardar."
              : persistenceCode === "invalid_state"
                ? "La cotización ya no admite cambios."
                : persistenceCode === "invalid_payload"
                  ? "Los datos de la cotización no son válidos."
                  : "No se pudo guardar la cotización. Los datos anteriores se conservaron.",
          },
          { status }
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
    } else if (Object.keys(updateData).length > 0) {
      try {
        await updateQuotationHeader({
          supabase: admin,
          quotationId: id,
          orgId: user.org_id,
          agencyId: existing.agency_id,
          actorId: user.id,
          expectedUpdatedAt: body.expected_updated_at,
          header: updateData,
        })
      } catch (error) {
        const persistenceCode = error instanceof QuotationStructurePersistenceError
          ? error.code
          : "atomic_update_failed"
        const status = persistenceCode === "quotation_changed" || persistenceCode === "invalid_state"
          ? 409
          : persistenceCode === "invalid_payload"
            ? 400
            : 500
        return NextResponse.json({
          error: persistenceCode === "quotation_changed"
            ? "La cotización cambió mientras la editabas. Recargala antes de volver a guardar."
            : persistenceCode === "invalid_state"
              ? "La cotización ya no admite cambios."
              : persistenceCode === "invalid_payload"
                ? "Los datos de la cotización no son válidos."
                : "No se pudo guardar la cotización. Los datos anteriores se conservaron.",
        }, { status })
      }
    }

    // Devolver cotización actualizada completa
    const { data: fullQuotation } = await admin
      .from("quotations")
      .select(`
        *,
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", id)
      .eq("org_id", user.org_id)
      .eq("agency_id", existing.agency_id)
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
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    const { id } = await params
    const supabase: any = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "delete")
    if (scope.memberAgencyIds.length === 0) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    const admin = createAdminClient() as any

    let deleteQuery = admin
      .from("quotations")
      .select("id, seller_id, status, agency_id")
      .eq("id", id)
      .eq("org_id", user.org_id)
    deleteQuery = applyAgencyPermissionScope(deleteQuery, scope)
    const { data: existing } = await deleteQuery.maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // Solo se pueden eliminar borradores
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar cotizaciones en estado DRAFT" },
        { status: 400 }
      )
    }

    // Un PDF emitido es evidencia comercial inmutable, aun cuando la
    // cotización siga en DRAFT. No intentamos borrarlo en cascada: conservamos
    // el historial y devolvemos un conflicto de negocio explícito.
    const { data: issuedDocument, error: issuedDocumentError } = await admin
      .from("issued_quotation_documents")
      .select("id")
      .eq("quotation_id", id)
      .eq("org_id", user.org_id)
      .eq("agency_id", existing.agency_id)
      .limit(1)
      .maybeSingle()

    if (issuedDocumentError) {
      console.error("Error checking issued quotation documents before delete:", issuedDocumentError)
      return NextResponse.json({ error: "No se pudo verificar el historial documental" }, { status: 500 })
    }

    if (issuedDocument) {
      return NextResponse.json(
        { error: "La cotización ya tiene un documento emitido y debe conservarse como historial" },
        { status: 409 }
      )
    }

    const { data: deleted, error } = await admin
      .from("quotations")
      .delete()
      .eq("id", id)
      .eq("org_id", user.org_id)
      .eq("agency_id", existing.agency_id)
      .eq("status", "DRAFT")
      .select("id")
      .maybeSingle()

    if (error?.code === "23503") {
      console.error("Quotation deletion blocked by related records:", { quotationId: id, error })
      return NextResponse.json(
        { error: "La cotización tiene registros relacionados que impiden eliminarla. Contactá a soporte." },
        { status: 409 }
      )
    }

    if (error) {
      console.error("Error deleting quotation:", { quotationId: id, error })
      return NextResponse.json({ error: "No se pudo eliminar la cotización. Intentá nuevamente." }, { status: 500 })
    }
    if (!deleted) {
      return NextResponse.json(
        { error: "La cotización cambió y ya no se puede eliminar" },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation DELETE:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
