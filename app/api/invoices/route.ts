import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { canAccessModule } from "@/lib/permissions"
import { calculateInvoice } from "@/lib/invoices/calculation"
import { isCreditNote, isCreditOrDebitNote } from "@/lib/invoices/credit-note"
import {
  buildExchangeRateMap,
  getExchangeRateWithFallback,
} from "@/lib/accounting/exchange-rates"
import {
  checkInvoiceCap,
  getInvoiceSaleCurrency,
  invoiceCurrencyToSupported,
  invoiceTotalInSaleCurrency,
  needsMarketRate,
  sumInvoicedInSaleCurrency,
  type InvoicedRow,
} from "@/lib/invoices/currency"
import {
  coercePositiveNumber,
  isExchangeRatePlausibleVsMarket,
  type SupportedCurrency,
} from "@/lib/payments/customer-income-fx"
import { normalizeReceptorDoc } from "@/lib/afip/afip-config"
import { z } from "zod"

export const dynamic = 'force-dynamic'

/**
 * Importe con símbolo de moneda para los mensajes de error del tope. Sin esto el
 * mensaje decía "$8050" sobre una venta en dólares.
 */
function formatInvoiceAmount(amount: number, currency: SupportedCurrency): string {
  const formatted = amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency === "USD" ? `USD ${formatted}` : "$" + formatted
}

function formatLocalDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Schema de validación para crear factura.
//
// Bug fix 2026-05-06: AFIP error 10013 — Factura A (cbte_tipo 1) obliga
// DocTipo=80 (CUIT) y un nro de 11 dígitos. Antes la API aceptaba DocTipo
// 96/86 si el cliente tenía DNI/CUIL guardado, y AFIP rechazaba todo el
// flujo recién al autorizar. Validamos antes para fallar rápido con un
// mensaje accionable en lugar de redirigir y dejar el borrador colgado.
const createInvoiceSchema = z.object({
  operation_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  agency_id: z.string().uuid(), // Requerido: viene del punto de venta seleccionado
  pto_vta: z.number(), // Requerido: punto de venta seleccionado
  cbte_tipo: z.number(),
  concepto: z.number().default(1),
  receptor_doc_tipo: z.number().default(80),
  receptor_doc_nro: z.string(),
  receptor_nombre: z.string().optional().default(''),
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
  // NC/ND: comprobante asociado (CbtesAsoc de AFIP). Requerido cuando cbte_tipo
  // es una nota de crédito/débito.
  original_invoice_id: z.string().uuid().optional().nullable(),
  cbte_asoc_tipo: z.number().optional(),
  cbte_asoc_pto_vta: z.number().optional(),
  cbte_asoc_nro: z.number().optional(),
  cbte_asoc_cuit: z.number().optional(),
  cbte_asoc_fch: z.string().optional(),
}).superRefine((data, ctx) => {
  // Factura A / A con leyenda → exige CUIT del receptor (AFIP 10013).
  // Tipos A: 1 (Factura A), 2 (NC A), 3 (ND A), 51 (Factura A MiPyME), 201 (Factura A FCE), etc.
  const isFacturaA = [1, 2, 3, 51, 52, 53, 201, 202, 203].includes(data.cbte_tipo)
  if (isFacturaA) {
    if (data.receptor_doc_tipo !== 80) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["receptor_doc_tipo"],
        message: "Factura A requiere CUIT (DocTipo 80). Cambiá la condición IVA del receptor o registrá su CUIT.",
      })
    }
    const cuit = String(data.receptor_doc_nro || "").replace(/\D/g, "")
    if (cuit.length !== 11) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["receptor_doc_nro"],
        message: "Factura A requiere CUIT de 11 dígitos del receptor.",
      })
    }
  }

  // NC/ND: AFIP exige el comprobante asociado (CbtesAsoc) o rechaza el voucher.
  if (isCreditOrDebitNote(data.cbte_tipo)) {
    if (!data.cbte_asoc_tipo || !data.cbte_asoc_pto_vta || !data.cbte_asoc_nro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cbte_asoc_nro"],
        message: "Una NC/ND requiere el comprobante asociado (tipo, punto de venta y número).",
      })
    }
    // La NC/ND debe emitirse contra el mismo punto de venta que la factura origen.
    if (data.cbte_asoc_pto_vta && data.cbte_asoc_pto_vta !== data.pto_vta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pto_vta"],
        message: "La NC/ND debe emitirse contra el mismo punto de venta que el comprobante asociado.",
      })
    }
  }
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
    // Las NC reducen lo facturado: no pueden exceder el total → se saltean el cap.
    // Las ND suman: el cap aplica normal. En la suma de "ya facturado", las NC
    // existentes restan (ledgerSign).
    //
    // VIB-151: todo se compara en la MONEDA DE LA VENTA. Antes se comparaban los
    // importes crudos, así que facturar en pesos una venta de USD 8050 topeaba en
    // $8050 y la agencia no podía emitir.
    if (validatedData.operation_id && !isCreditNote(validatedData.cbte_tipo)) {
      const { data: operation, error: opErr } = await (supabase.from("operations") as any)
        .select("id, org_id, sale_amount_total, sale_currency, currency")
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

      const saleCurrency = getInvoiceSaleCurrency(operation)
      const invoiceCurrency = invoiceCurrencyToSupported(validatedData.moneda)
      if (!invoiceCurrency) {
        return NextResponse.json(
          { error: `Moneda ${validatedData.moneda} no soportada para facturar una operación. Usá PES o DOL.` },
          { status: 400 }
        )
      }

      // Facturas ya autorizadas de la operación (pueden estar en otra moneda).
      const { data: existingInvoices } = await (supabase.from("invoices") as any)
        .select("imp_total, cbte_tipo, moneda, cotizacion, fecha_emision")
        .eq("operation_id", validatedData.operation_id)
        // Scope explícito por org (defense-in-depth): la operación ya se validó
        // contra el org de la agencia, pero la tabla es tenant-scoped.
        .eq("org_id", agency.org_id)
        .eq("status", "authorized")

      const invoicedRows = (existingInvoices ?? []) as InvoicedRow[]
      const capDate = formatLocalDate()
      const needsRateForNew = invoiceCurrency !== saleCurrency
      const needsRateForPast = invoicedRows.some((row) => needsMarketRate(row, saleCurrency))

      // TC de referencia (`exchange_rates`: fuente autoritativa de valuación
      // según docs/finance/TIPO-DE-CAMBIO-FUENTES.md). Solo se consulta si hace falta.
      let marketRate: number | null = null
      if (needsRateForNew || needsRateForPast) {
        const market = await getExchangeRateWithFallback(supabase, capDate, "invoices:cap")
        marketRate = market.rate
      }

      let pastRateFor: (date: string | null | undefined) => number | null = () => marketRate
      if (needsRateForPast) {
        const rateMap = await buildExchangeRateMap(
          supabase,
          invoicedRows.map((row) => row.fecha_emision)
        )
        pastRateFor = (date) => rateMap(date) ?? marketRate
      }

      const { total: alreadyInvoiced, unconverted } = sumInvoicedInSaleCurrency({
        invoices: invoicedRows,
        saleCurrency,
        rateFor: pastRateFor,
      })

      // No silenciar: sin TC el restante queda inflado y dejaría facturar de más.
      if (unconverted.length > 0) {
        console.error(
          `[invoices:cap] Sin tipo de cambio para valuar ${unconverted.length} factura(s) de la operación ${validatedData.operation_id}`
        )
        return NextResponse.json(
          {
            error:
              "No se puede validar el total facturado: falta el tipo de cambio de facturas anteriores de esta operación. Cargá el TC del día en Contabilidad y reintentá.",
          },
          { status: 400 }
        )
      }

      // TC de ESTA factura. El front arma los ítems con el TC que muestra en
      // pantalla (editable), así que se usa ese; el de referencia solo valida que
      // no sea un disparate (banda amplia, igual que el guard de cobros: detecta
      // errores de orden de magnitud, no diferencias de cotización).
      let capRate: number | null = null
      if (needsRateForNew) {
        const informedRate = coercePositiveNumber(validatedData.cotizacion)
        capRate = informedRate && informedRate > 1 ? informedRate : marketRate

        if (!isExchangeRatePlausibleVsMarket(capRate, marketRate)) {
          return NextResponse.json(
            {
              error: `El tipo de cambio informado (${capRate}) no es verosímil contra el de referencia (${marketRate}). Corregí la cotización.`,
              suggested_rate: marketRate,
            },
            { status: 400 }
          )
        }
      }

      const saleTotal = Number(operation.sale_amount_total)
      const newTotal = Number(calculatedInvoice.totals.imp_total)
      const newTotalInSaleCurrency = invoiceTotalInSaleCurrency({
        impTotal: newTotal,
        moneda: validatedData.moneda,
        saleCurrency,
        exchangeRate: capRate,
      })

      if (newTotalInSaleCurrency === null) {
        return NextResponse.json(
          {
            error: `No se pudo convertir el total de la factura (${validatedData.moneda}) a la moneda de la venta (${saleCurrency}).`,
          },
          { status: 400 }
        )
      }

      const cap = checkInvoiceCap({ saleTotal, alreadyInvoiced, newTotalInSaleCurrency })

      if (!cap.ok) {
        // El restante se informa en la moneda de la venta y, si la factura va en
        // otra, también convertido: sin eso el mensaje dice "$8050" sobre una
        // venta en dólares y no hay forma de entenderlo.
        const remainingInInvoiceCurrency =
          needsRateForNew && capRate
            ? saleCurrency === "USD"
              ? cap.remaining * capRate
              : cap.remaining / capRate
            : cap.remaining
        const equivalence = needsRateForNew
          ? ` (≈ ${formatInvoiceAmount(remainingInInvoiceCurrency, invoiceCurrency)} al TC ${capRate})`
          : ""

        return NextResponse.json(
          {
            error: `No se puede facturar ${formatInvoiceAmount(newTotal, invoiceCurrency)}: el total vendido restante de la operación es ${formatInvoiceAmount(cap.remaining, saleCurrency)}${equivalence}`,
            max_remaining: cap.remaining,
            max_remaining_currency: saleCurrency,
            max_remaining_invoice_currency: Math.round(remainingInInvoiceCurrency * 100) / 100,
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

    // Consumidor final sin identificar: DocTipo=99 cuando no hay documento
    // (regla AFIP 10015). Evita guardar borradores con DocTipo=96/DocNro=0.
    const receptorDoc = normalizeReceptorDoc(
      validatedData.cbte_tipo,
      validatedData.receptor_doc_tipo,
      validatedData.receptor_doc_nro
    )

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
        receptor_doc_tipo: receptorDoc.docTipo,
        receptor_doc_nro: receptorDoc.docNro,
        receptor_nombre: validatedData.receptor_nombre || "CONSUMIDOR FINAL",
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
        // NC/ND: comprobante asociado (null para facturas normales)
        original_invoice_id: validatedData.original_invoice_id || null,
        cbte_asoc_tipo: validatedData.cbte_asoc_tipo ?? null,
        cbte_asoc_pto_vta: validatedData.cbte_asoc_pto_vta ?? null,
        cbte_asoc_nro: validatedData.cbte_asoc_nro ?? null,
        cbte_asoc_cuit: validatedData.cbte_asoc_cuit ?? null,
        cbte_asoc_fch: validatedData.cbte_asoc_fch ?? null,
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
      // Rollback: eliminar factura (scope explícito por org, no confiar en RLS)
      await supabase.from("invoices").delete().eq("id", invoice.id).eq("org_id", agency.org_id)
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
