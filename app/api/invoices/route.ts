import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { canAccessModule } from "@/lib/permissions"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para crear factura
const createInvoiceSchema = z.object({
  operation_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  agency_id: z.string().uuid(), // Requerido: viene del punto de venta seleccionado
  pto_vta: z.number(), // Requerido: punto de venta seleccionado
  cbte_tipo: z.number(),
  concepto: z.number().default(1),
  receptor_doc_tipo: z.number().default(80),
  receptor_doc_nro: z.string(),
  receptor_nombre: z.string(),
  receptor_domicilio: z.string().optional(),
  receptor_condicion_iva: z.number().optional(),
  items: z.array(z.object({
    descripcion: z.string(),
    cantidad: z.number().default(1),
    precio_unitario: z.number(),
    iva_id: z.number().default(5),
    iva_porcentaje: z.number().default(21),
  })),
  moneda: z.string().default('PES'),
  cotizacion: z.number().default(1),
  fch_serv_desde: z.string().optional(),
  fch_serv_hasta: z.string().optional(),
  fecha_vto_pago: z.string().optional(),
  notes: z.string().optional(),
})

// GET - Obtener facturas
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Verificar permiso
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para ver facturas" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Parámetros de filtro
    const status = searchParams.get("status")
    const operationId = searchParams.get("operationId")
    const customerId = searchParams.get("customerId")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // Query base
    let query = (supabase.from("invoices") as any)
      .select(`
        *,
        operations (id, file_code, destination),
        customers (id, first_name, last_name),
        invoice_items (*)
      `)
      .in("agency_id", agencyIds)
      .order("created_at", { ascending: false })

    // Filtros
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }
    if (operationId) {
      query = query.eq("operation_id", operationId)
    }
    if (customerId) {
      query = query.eq("customer_id", customerId)
    }

    // Paginación
    query = query.range(offset, offset + limit - 1)

    const { data: invoices, error } = await query

    if (error) {
      console.error("Error fetching invoices:", error)
      return NextResponse.json(
        { error: "Error al obtener facturas" },
        { status: 500 }
      )
    }

    return NextResponse.json({ invoices })
  } catch (error: any) {
    console.error("Error in GET /api/invoices:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener facturas" },
      { status: 500 }
    )
  }
}

// POST - Crear factura (borrador)
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para crear facturas" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario para validación
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    
    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "No tiene agencias asignadas" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createInvoiceSchema.parse(body)

    // Validar que la agencia del punto de venta pertenece al usuario
    if (!agencyIds.includes(validatedData.agency_id)) {
      return NextResponse.json(
        { error: "No tiene acceso a la agencia seleccionada" },
        { status: 403 }
      )
    }

    // Calcular totales
    let impNeto = 0
    let impIva = 0
    let impTotal = 0

    const itemsWithTotals = validatedData.items.map((item, index) => {
      const subtotal = item.cantidad * item.precio_unitario
      const ivaImporte = subtotal * (item.iva_porcentaje / 100)
      const total = subtotal + ivaImporte

      impNeto += subtotal
      impIva += ivaImporte
      impTotal += total

      return {
        ...item,
        subtotal,
        iva_importe: ivaImporte,
        total,
        orden: index,
      }
    })

    // Crear factura
    const { data: invoice, error: invoiceError } = await (supabase.from("invoices") as any)
      .insert({
        agency_id: validatedData.agency_id, // Usar la agencia del punto de venta
        operation_id: validatedData.operation_id || null,
        customer_id: validatedData.customer_id || null,
        cbte_tipo: validatedData.cbte_tipo,
        pto_vta: validatedData.pto_vta,
        concepto: validatedData.concepto,
        receptor_doc_tipo: validatedData.receptor_doc_tipo,
        receptor_doc_nro: validatedData.receptor_doc_nro,
        receptor_nombre: validatedData.receptor_nombre,
        receptor_domicilio: validatedData.receptor_domicilio,
        receptor_condicion_iva: validatedData.receptor_condicion_iva,
        imp_neto: impNeto,
        imp_iva: impIva,
        imp_total: impTotal,
        moneda: validatedData.moneda,
        cotizacion: validatedData.cotizacion,
        fch_serv_desde: validatedData.fch_serv_desde,
        fch_serv_hasta: validatedData.fch_serv_hasta,
        fecha_vto_pago: validatedData.fecha_vto_pago,
        notes: validatedData.notes,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single()

    if (invoiceError) {
      console.error("Error creating invoice:", invoiceError)
      return NextResponse.json(
        { error: "Error al crear factura" },
        { status: 500 }
      )
    }

    // Crear items
    const itemsToInsert = itemsWithTotals.map(item => ({
      invoice_id: invoice.id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
      iva_id: item.iva_id,
      iva_porcentaje: item.iva_porcentaje,
      iva_importe: item.iva_importe,
      total: item.total,
      orden: item.orden,
    }))

    const { error: itemsError } = await (supabase.from("invoice_items") as any)
      .insert(itemsToInsert)

    if (itemsError) {
      console.error("Error creating invoice items:", itemsError)
      // Rollback: eliminar factura
      await supabase.from("invoices").delete().eq("id", invoice.id)
      return NextResponse.json(
        { error: "Error al crear items de factura" },
        { status: 500 }
      )
    }

    return NextResponse.json({ invoice, items: itemsToInsert })
  } catch (error: any) {
    console.error("Error in POST /api/invoices:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear factura" },
      { status: 500 }
    )
  }
}
