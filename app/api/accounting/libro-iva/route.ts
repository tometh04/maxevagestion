import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())
    const format = searchParams.get("format") || "json" // json or csv

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const endDate = `${year}-${String(month).padStart(2, "0")}-31`

    // ── LIBRO IVA VENTAS ──
    // From invoices table (facturas emitidas con CAE)
    const { data: invoices } = await (supabase.from("invoices") as any)
      .select(`
        id, cbte_tipo, pto_vta, cbte_nro, cae, cae_fch_vto,
        receptor_doc_tipo, receptor_doc_nro, receptor_nombre,
        imp_neto, imp_iva, imp_total, imp_tot_conc, imp_op_ex, imp_trib,
        moneda, cotizacion, concepto, created_at,
        invoice_items (descripcion, cantidad, precio_unitario, iva_porcentaje, subtotal, iva_monto)
      `)
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .eq("status", "AUTHORIZED")
      .order("created_at", { ascending: true })

    // Also from iva_sales (for operations without formal invoice)
    const { data: ivaSales } = await (supabase.from("iva_sales") as any)
      .select(`
        id, operation_id, sale_amount_total, net_amount, iva_amount, currency, sale_date,
        operations:operation_id (id, file_code, destination)
      `)
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("sale_date", { ascending: true })

    // ── LIBRO IVA COMPRAS ──
    // From purchase_invoices (facturas de operadores)
    const { data: purchaseInvoices } = await (supabase.from("purchase_invoices") as any)
      .select(`
        id, invoice_type, invoice_number, invoice_date,
        emitter_cuit, emitter_name,
        currency, net_amount, iva_rate, iva_amount,
        perception_iva, perception_iibb, other_taxes, total_amount,
        operators:operator_id (id, name)
      `)
      .gte("invoice_date", startDate)
      .lte("invoice_date", endDate)
      .order("invoice_date", { ascending: true })

    // Also from iva_purchases (estimated, for operations without formal purchase invoice)
    const { data: ivaPurchases } = await (supabase.from("iva_purchases") as any)
      .select(`
        id, operation_id, operator_cost_total, net_amount, iva_amount, currency, purchase_date,
        operations:operation_id (id, file_code, destination),
        operators:operator_id (id, name)
      `)
      .gte("purchase_date", startDate)
      .lte("purchase_date", endDate)
      .order("purchase_date", { ascending: true })

    // ── PERCEPCIONES del período ──
    const taxPeriod = `${year}-${String(month).padStart(2, "0")}`
    const { data: percepciones } = await (supabase.from("tax_withholdings") as any)
      .select("*")
      .eq("tax_period", taxPeriod)
      .eq("direction", "SUFFERED")

    // ── TOTALES ──
    const salesInvoices = invoices || []
    const salesIva = ivaSales || []
    const purchases = purchaseInvoices || []
    const purchasesIva = ivaPurchases || []
    const percs = percepciones || []

    const totals = {
      ventas: {
        neto: salesInvoices.reduce((s: number, i: any) => s + Number(i.imp_neto || 0), 0),
        iva: salesInvoices.reduce((s: number, i: any) => s + Number(i.imp_iva || 0), 0),
        total: salesInvoices.reduce((s: number, i: any) => s + Number(i.imp_total || 0), 0),
        count: salesInvoices.length,
      },
      ventas_iva_estimado: {
        iva: salesIva.reduce((s: number, i: any) => s + Number(i.iva_amount || 0), 0),
        count: salesIva.length,
      },
      compras: {
        neto: purchases.reduce((s: number, i: any) => s + Number(i.net_amount || 0), 0),
        iva: purchases.reduce((s: number, i: any) => s + Number(i.iva_amount || 0), 0),
        percepciones_iva: purchases.reduce((s: number, i: any) => s + Number(i.perception_iva || 0), 0),
        percepciones_iibb: purchases.reduce((s: number, i: any) => s + Number(i.perception_iibb || 0), 0),
        total: purchases.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
        count: purchases.length,
      },
      compras_iva_estimado: {
        iva: purchasesIva.reduce((s: number, i: any) => s + Number(i.iva_amount || 0), 0),
        count: purchasesIva.length,
      },
      percepciones_sufridas: {
        iva: percs.filter((p: any) => p.type === "PERCEPCION_IVA").reduce((s: number, p: any) => s + Number(p.amount), 0),
        iibb: percs.filter((p: any) => p.type === "PERCEPCION_IIBB").reduce((s: number, p: any) => s + Number(p.amount), 0),
      },
      posicion_iva: {
        debito_fiscal: 0,
        credito_fiscal: 0,
        percepciones: 0,
        saldo: 0,
      },
    }

    // Calculate IVA position
    // Débito = IVA from issued invoices (or estimated if no invoice)
    totals.posicion_iva.debito_fiscal = totals.ventas.iva > 0
      ? totals.ventas.iva
      : totals.ventas_iva_estimado.iva

    // Crédito = IVA from purchase invoices (or estimated if no invoice)
    totals.posicion_iva.credito_fiscal = totals.compras.iva > 0
      ? totals.compras.iva
      : totals.compras_iva_estimado.iva

    // Percepciones as additional credit
    totals.posicion_iva.percepciones = totals.percepciones_sufridas.iva

    // Saldo = Débito - Crédito - Percepciones
    totals.posicion_iva.saldo =
      totals.posicion_iva.debito_fiscal -
      totals.posicion_iva.credito_fiscal -
      totals.posicion_iva.percepciones

    if (format === "csv") {
      return generateCSV(salesInvoices, purchases, totals, year, month)
    }

    return NextResponse.json({
      periodo: { year, month },
      libro_ventas: salesInvoices,
      libro_compras: purchases,
      iva_ventas_estimado: salesIva,
      iva_compras_estimado: purchasesIva,
      percepciones: percs,
      totals,
    })
  } catch (error: any) {
    console.error("Error generating libro IVA:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateCSV(ventas: any[], compras: any[], totals: any, year: number, month: number) {
  const lines: string[] = []
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })

  // Header
  lines.push(`LIBRO IVA - ${monthName.toUpperCase()}`)
  lines.push("")

  // Libro IVA Ventas
  lines.push("LIBRO IVA VENTAS")
  lines.push("Fecha,Tipo,Punto Venta,Número,Doc Tipo,Doc Nro,Razón Social,Neto Gravado,IVA,No Gravado,Exento,Total,CAE")

  for (const inv of ventas) {
    const cbteTipo = inv.cbte_tipo === 1 ? "FA-A" : inv.cbte_tipo === 6 ? "FA-B" : inv.cbte_tipo === 11 ? "FA-C" : `T${inv.cbte_tipo}`
    const fecha = new Date(inv.created_at).toLocaleDateString("es-AR")
    lines.push([
      fecha,
      cbteTipo,
      String(inv.pto_vta).padStart(4, "0"),
      String(inv.cbte_nro || 0).padStart(8, "0"),
      inv.receptor_doc_tipo,
      inv.receptor_doc_nro,
      `"${(inv.receptor_nombre || "").replace(/"/g, '""')}"`,
      inv.imp_neto,
      inv.imp_iva,
      inv.imp_tot_conc || 0,
      inv.imp_op_ex || 0,
      inv.imp_total,
      inv.cae || "",
    ].join(","))
  }

  lines.push(`TOTAL VENTAS,,,,,,, ${totals.ventas.neto}, ${totals.ventas.iva},,,${totals.ventas.total},`)
  lines.push("")

  // Libro IVA Compras
  lines.push("LIBRO IVA COMPRAS")
  lines.push("Fecha,Tipo,Número,CUIT Emisor,Razón Social,Neto Gravado,IVA,Perc IVA,Perc IIBB,Otros,Total")

  for (const inv of compras) {
    const fecha = inv.invoice_date ? new Date(inv.invoice_date + "T12:00:00").toLocaleDateString("es-AR") : ""
    const tipo = inv.invoice_type === "FACTURA_A" ? "FA-A" : inv.invoice_type === "FACTURA_B" ? "FA-B" : inv.invoice_type
    lines.push([
      fecha,
      tipo,
      inv.invoice_number,
      inv.emitter_cuit,
      `"${(inv.emitter_name || "").replace(/"/g, '""')}"`,
      inv.net_amount,
      inv.iva_amount,
      inv.perception_iva || 0,
      inv.perception_iibb || 0,
      inv.other_taxes || 0,
      inv.total_amount,
    ].join(","))
  }

  lines.push(`TOTAL COMPRAS,,,,,${totals.compras.neto},${totals.compras.iva},${totals.compras.percepciones_iva},${totals.compras.percepciones_iibb},,${totals.compras.total}`)
  lines.push("")

  // Posición IVA
  lines.push("POSICIÓN IVA")
  lines.push(`Débito Fiscal (IVA Ventas),${totals.posicion_iva.debito_fiscal}`)
  lines.push(`Crédito Fiscal (IVA Compras),${totals.posicion_iva.credito_fiscal}`)
  lines.push(`Percepciones IVA a Favor,${totals.posicion_iva.percepciones}`)
  lines.push(`SALDO IVA A PAGAR,${totals.posicion_iva.saldo}`)

  const csv = lines.join("\n")
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="libro-iva-${year}-${String(month).padStart(2, "0")}.csv"`,
    },
  })
}
