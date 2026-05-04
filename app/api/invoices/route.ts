import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { canAccessModule } from "@/lib/permissions"
import { calculateInvoice } from "@/lib/invoices/calculation"
import { z } from "zod"

export const dynamic = 'force-dynamic'

function formatLocalDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

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
  amount_entry_mode: z.enum(["NET", "FINAL"]).optional(),
  items: z.array(z.object({
    descripcion: z.string(),
    cantidad: z.number().default(1),
    precio_unitario: z.number(),
    iva_id: z.number().default(5),
    iva_porcentaje: z.number().default(21),
    tax_treatment: z.enum(["GRAVADO", "EXENTO", "NO_GRAVADO"]).optional(),
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

// POST - Crear factura
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

    const calculatedInvoice = calculateInvoice(validatedData.items, validatedData.amount_entry_mode)
    const itemsWithTotals = calculatedInvoice.items.map((item, index) => ({
      ...item,
      orden: index,
    }))

    // Resolver org_id desde la agencia — requerido por RLS policy invoices_tenant_isolation
    const { data: agency } = await (supabase.from("agencies") as any)
      .select("org_id")
      .eq("id", validatedData.agency_id)
      .single()

    if (!agency?.org_id) {
      return NextResponse.json(
        { error: "Agencia sin org_id asociado — contactar soporte" },
        { status: 400 }
      )
    }

    // Si la factura está atada a una operación, validar que no se exceda
    // el total vendido restante (suma de authorized + new <= sale_amount_total).
    if (validatedData.operation_id) {
      const { data: operation, error: opErr } = await (supabase.from("operations") as any)
        .select("id, org_id, sale_amount_total")
        .eq("id", validatedData.operation_id)
        .single()

      if (opErr || !operation) {
        return NextResponse.json(
          { error: "Operación no encontrada" },
          { status: 404 }
        )
      }

      // Cross-tenant check: la operación debe pertenecer al mismo org que la agencia
      if (operation.org_id !== agency.org_id) {
        return NextResponse.json(
          { error: "La operación no pertenece a tu organización" },
          { status: 403 }
        )
      }

      // Sum authorized invoices de esta operación
      const { data: existingInvoices } = await (supabase.from("invoices") as any)
        .select("imp_total")
        .eq("operation_id", validatedData.operation_id)
        .eq("status", "authorized")

      const alreadyInvoiced = (existingInvoices ?? []).reduce(
        (acc: number, i: any) => acc + Number(i.imp_total),
        0
      )
      const saleTotal = Number(operation.sale_amount_total)
      const remaining = Math.round((saleTotal - alreadyInvoiced) * 100) / 100
      const newTotal = Number(calculatedInvoice.totals.imp_total)

      // Tolerancia 1 cent para float precision
      if (newTotal > remaining + 0.01) {
        return NextResponse.json(
          {
            error: `No se puede facturar $${newTotal.toFixed(2)}: el total vendido restante de la operación es $${remaining.toFixed(2)}`,
            max_remaining: remaining,
          },
          { status: 400 }
        )
      }
    }

    // Crear factura
    const fechaEmision = formatLocalDate()
    const fchServDesde = validatedData.fch_serv_desde || (validatedData.concepto === 2 || validatedData.concepto === 3 ? fechaEmision : undefined)
    const fchServHasta = validatedData.fch_serv_hasta || fchServDesde
    const fechaVtoPago = validatedData.fecha_vto_pago || fchServHasta

    const { data: invoice, error: invoiceError } = await (supabase.from("invoices") as any)
      .insert({
        agency_id: validatedData.agency_id, // Usar la agencia del punto de venta
        org_id: agency.org_id,               // Para RLS multi-tenant
        verification_status: "unverified",   // Default: se verifica al autorizar
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
        amount_entry_mode: calculatedInvoice.amount_entry_mode,
        imp_neto: calculatedInvoice.totals.imp_neto,
        imp_iva: calculatedInvoice.totals.imp_iva,
        imp_total: calculatedInvoice.totals.imp_total,
        imp_tot_conc: calculatedInvoice.totals.imp_tot_conc,
        imp_op_ex: calculatedInvoice.totals.imp_op_ex,
        imp_trib: calculatedInvoice.totals.imp_trib,
        moneda: validatedData.moneda,
        cotizacion: validatedData.cotizacion,
        fecha_emision: fechaEmision,
        fch_serv_desde: fchServDesde,
        fch_serv_hasta: fchServHasta,
        fecha_vto_pago: fechaVtoPago,
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
      tax_treatment: item.tax_treatment,
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
