import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeQuotationPricingMode } from "@/lib/quotations/presentation"
import { normalizeRegion } from "@/lib/manychat/sync"
import {
  createQuotationWithStructure,
  prepareQuotationOptionsForPersistence,
  QuotationStructurePersistenceError,
} from "@/lib/quotations/persistence"
import {
  agencyPermissionMode,
  applyAgencyPermissionScope,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { quotationPresentationContentSchema } from "@/lib/quotation-documents/schemas"
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

// GET — Listar cotizaciones con filtros
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const supabase: any = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "read")
    if (scope.memberAgencyIds.length === 0) {
      return NextResponse.json({ data: [] })
    }
    if (scope.agencyIds.length === 0) {
      return NextResponse.json({ error: "No tiene permiso para ver cotizaciones" }, { status: 403 })
    }
    const dataSupabase: any = createAdminClient()

    const { searchParams } = new URL(request.url)

    let query = dataSupabase
      .from("quotations")
      .select(`
        *,
        lead:lead_id(id, contact_name, contact_phone, contact_email, destination, status),
        seller:seller_id(id, name, email),
        quotation_options(*)
      `)
      .eq("org_id", user.org_id)
      .order("created_at", { ascending: false })
    query = applyAgencyPermissionScope(query, scope)

    // El predicado mixto ya limita a seller=user sólo en las agencias own.
    const sellerId = searchParams.get("seller_id")
    if (sellerId && sellerId !== "ALL") {
      query = query.eq("seller_id", sellerId)
    }

    // Filtro por lead
    const leadId = searchParams.get("lead_id")
    if (leadId) {
      query = query.eq("lead_id", leadId)
    }

    // Filtro por estado
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    // Filtro por agencia
    const agencyId = searchParams.get("agency_id")
    if (agencyId && agencyId !== "ALL") {
      if (!agencyPermissionMode(scope, agencyId)) {
        return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
      }
      query = query.eq("agency_id", agencyId)
    }

    // Paginación
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")
    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) {
      console.error("Error fetching quotations:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: Array.isArray(data)
        ? data.map(withQuotationDocumentProjection)
        : data,
    })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotations GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// POST — Crear cotización
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const supabase: any = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "write")
    if (scope.memberAgencyIds.length > 0 && scope.agencyIds.length === 0) {
      return NextResponse.json({ error: "No tiene permiso para crear cotizaciones" }, { status: 403 })
    }

    const body = await request.json()
    const presentationContent = quotationPresentationContentSchema.safeParse(body.presentation_content ?? {})
    if (!presentationContent.success) {
      return NextResponse.json(
        { error: "El contenido comercial de la cotización no es válido", issues: presentationContent.error.issues },
        { status: 400 }
      )
    }

    const {
      lead_id,
      agency_id,
      destination,
      origin,
      region,
      departure_date,
      return_date,
      adults,
      children,
      infants,
      currency,
      pricing_mode,
      package_description, // descripción general del paquete (visible al cliente)
      notes,               // notas para el cliente (visibles al cliente)
      internal_notes,      // notas internas privadas del vendedor (NO visibles al cliente)
      terms_and_conditions,
      payment_methods,
      options, // Array de opciones: [{ title, total_amount, manual_total_amount?, items: [...] }]
    } = body

    // Validaciones básicas
    if (!agency_id) return NextResponse.json({ error: "agency_id es requerido" }, { status: 400 })
    if (!destination) return NextResponse.json({ error: "destination es requerido" }, { status: 400 })
    if (!departure_date) return NextResponse.json({ error: "departure_date es requerido" }, { status: 400 })
    if (!options || !Array.isArray(options) || options.length === 0) {
      return NextResponse.json({ error: "Se requiere al menos una opción" }, { status: 400 })
    }

    // El body nunca decide tenancy. La agencia y el lead deben pertenecer a la
    // org autenticada y estar dentro del scope real del usuario.
    const agencyMode = agencyPermissionMode(scope, agency_id)
    if (!agencyMode) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("id")
      .eq("id", agency_id)
      .eq("org_id", user.org_id)
      .maybeSingle()
    if (!agency) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
    }

    if (lead_id) {
      let leadQuery = supabase
        .from("leads")
        .select("id")
        .eq("id", lead_id)
        .eq("org_id", user.org_id)
        .eq("agency_id", agency_id)
      if (agencyMode === "own") {
        leadQuery = leadQuery.eq("assigned_seller_id", user.id)
      }
      const { data: lead } = await leadQuery.maybeSingle()
      if (!lead) {
        return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
      }
    }

    let preparedOptions
    try {
      preparedOptions = prepareQuotationOptionsForPersistence(options, currency || "USD")
    } catch (error: any) {
      return NextResponse.json({ error: error.message || "Opciones inválidas" }, { status: 400 })
    }
    if (preparedOptions.length === 0) {
      return NextResponse.json({ error: "Se requiere al menos una opción válida" }, { status: 400 })
    }

    // Calcular vencimiento (24hs desde ahora)
    const validUntil = new Date()
    validUntil.setHours(validUntil.getHours() + 24)

    // El total de la cotización es el de la primera opción (referencial)
    const firstOption = preparedOptions[0]

    const quotationId = randomUUID()
    let quotation: any
    const admin = createAdminClient() as any
    try {
      quotation = await createQuotationWithStructure({
        supabase: admin,
        quotationId,
        orgId: user.org_id,
        agencyId: agency_id,
        actorId: user.id,
        currency: currency || "USD",
        preparedOptions,
        header: {
        lead_id: lead_id || null,
        destination,
        origin: origin || null,
        // Las regiones de leads son configurables por org (migración
        // 20260604000001) pero quotations.region conserva el CHECK legacy de
        // 7 valores. Normalizar acá: región custom → se infiere del destino
        // o cae en OTROS. Sin esto, generar cotización desde un lead con
        // región custom viola quotations_region_check.
        region: normalizeRegion(region, destination),
        departure_date,
        return_date: return_date || null,
        valid_until: validUntil.toISOString().split("T")[0],
        adults: adults || 1,
        children: children || 0,
        infants: infants || 0,
        subtotal: firstOption.total_amount,
        total_amount: firstOption.total_amount,
        currency: currency || "USD",
        pricing_mode: normalizeQuotationPricingMode(pricing_mode ?? "PER_PERSON"),
        // Token público desde el alta: permite Generar PDF / link público sin
        // esperar un PATCH (flujo Emilia y "Editar borrador" en CRM).
        public_token: randomUUID(),
        package_description: package_description || null,
        notes: notes || null,
        internal_notes: internal_notes || null,
        terms_and_conditions: terms_and_conditions || null,
        payment_methods: Array.isArray(payment_methods) ? payment_methods : [],
        presentation_content: presentationContent.data,
        presentation_schema_version: presentationContent.data.schemaVersion,
        },
      })
    } catch (error) {
      console.error("Error creating quotation atomically during POST:", {
        quotationId,
        ...getQuotationPersistenceLogContext(error),
      })
      const persistenceCode = error instanceof QuotationStructurePersistenceError
        ? error.code
        : "atomic_create_failed"
      return NextResponse.json({
        error: persistenceCode === "invalid_payload"
          ? "Los datos de la cotización no son válidos."
          : "No se pudo guardar la cotización completa. No se realizaron cambios.",
      }, { status: persistenceCode === "invalid_payload" ? 400 : 500 })
    }

    // Devolver cotización completa con opciones e items
    const { data: fullQuotation, error: fullQuotationError } = await admin
      .from("quotations")
      .select(`
        *,
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", quotationId)
      .eq("org_id", user.org_id)
      .single()

    if (fullQuotationError || !fullQuotation) {
      console.error("Quotation created but response could not be reloaded:", {
        quotationId,
        cause: fullQuotationError?.message,
      })
      return NextResponse.json(
        {
          data: quotation,
          warning: "La cotización se guardó, pero no se pudo recargar su detalle completo.",
        },
        { status: 201 }
      )
    }

    return NextResponse.json({ data: fullQuotation }, { status: 201 })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotations POST:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
