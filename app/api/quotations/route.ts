import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeQuotationPricingMode } from "@/lib/quotations/presentation"
import {
  insertQuotationOptionsOrThrow,
  prepareQuotationOptionsForPersistence,
  QuotationStructurePersistenceError,
} from "@/lib/quotations/persistence"

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
    const supabase: any = await createServerClient()
    const { searchParams } = new URL(request.url)

    let query = supabase
      .from("quotations")
      .select(`
        *,
        lead:lead_id(id, contact_name, contact_phone, contact_email, destination, status),
        seller:seller_id(id, name, email),
        quotation_options(*)
      `)
      .order("created_at", { ascending: false })

    // Filtro por vendedor (SELLER solo ve las suyas)
    if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    } else {
      const sellerId = searchParams.get("seller_id")
      if (sellerId && sellerId !== "ALL") {
        query = query.eq("seller_id", sellerId)
      }
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

    return NextResponse.json({ data })
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
    const supabase: any = await createServerClient()
    const body = await request.json()

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
      notes,
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

    let preparedOptions
    try {
      preparedOptions = prepareQuotationOptionsForPersistence(options, currency || "USD")
    } catch (error: any) {
      return NextResponse.json({ error: error.message || "Opciones inválidas" }, { status: 400 })
    }
    if (preparedOptions.length === 0) {
      return NextResponse.json({ error: "Se requiere al menos una opción válida" }, { status: 400 })
    }

    // Generar número de cotización (scoped por org — LOLO puede tener
    // COT-2026-0001 aunque Lozada esté en 0500, cada tenant numera aparte).
    const orgIdForNumber = (user as any).org_id as string | null | undefined
    const { data: quotationNumber } = await (supabase as any).rpc(
      "generate_quotation_number",
      orgIdForNumber ? { p_org_id: orgIdForNumber } : {}
    )

    // Calcular vencimiento (24hs desde ahora)
    const validUntil = new Date()
    validUntil.setHours(validUntil.getHours() + 24)

    // El total de la cotización es el de la primera opción (referencial)
    const firstOption = preparedOptions[0]

    // Crear cotización
    const { data: quotation, error: quotationError } = await supabase
      .from("quotations")
      .insert({
        lead_id: lead_id || null,
        agency_id,
        seller_id: user.id,
        quotation_number: quotationNumber || `COT-${new Date().getFullYear()}-${Date.now()}`,
        destination,
        origin: origin || null,
        region: region || "OTROS",
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
        status: "DRAFT",
        notes: notes || null,
        terms_and_conditions: terms_and_conditions || null,
        payment_methods: Array.isArray(payment_methods) ? payment_methods : [],
        created_by: user.id,
      })
      .select()
      .single()

    if (quotationError) {
      console.error("Error creating quotation:", quotationError)
      return NextResponse.json({ error: quotationError.message }, { status: 500 })
    }

    try {
      await insertQuotationOptionsOrThrow({
        supabase,
        quotationId: quotation.id,
        currency: currency || "USD",
        preparedOptions,
      })
    } catch (error) {
      console.error("Error persisting quotation structure during POST:", {
        quotationId: quotation.id,
        quotationNumber: quotation.quotation_number,
        ...getQuotationPersistenceLogContext(error),
      })

      const { error: rollbackError } = await supabase
        .from("quotations")
        .delete()
        .eq("id", quotation.id)

      if (rollbackError) {
        console.error("Error rolling back quotation after POST failure:", {
          quotationId: quotation.id,
          cause: rollbackError.message,
        })
      }

      return NextResponse.json(
        { error: "No se pudo guardar la cotización completa. No se realizaron cambios." },
        { status: 500 }
      )
    }

    // Devolver cotización completa con opciones e items
    const { data: fullQuotation } = await supabase
      .from("quotations")
      .select(`
        *,
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", quotation.id)
      .single()

    return NextResponse.json({ data: fullQuotation }, { status: 201 })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotations POST:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
