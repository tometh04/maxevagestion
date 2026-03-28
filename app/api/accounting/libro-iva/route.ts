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
    const format = searchParams.get("format") || "json" // json, csv, or rg3683

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

    if (format === "rg3683") {
      return generateRG3683CSV(salesInvoices, purchases, year, month)
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

// ── AFIP RG 3683 helpers ──

const CBTE_TIPO_MAP: Record<number, string> = {
  1: "001", 2: "002", 3: "003", 4: "004", 5: "005",
  6: "006", 7: "007", 8: "008", 9: "009", 10: "010",
  11: "011", 12: "012", 13: "013",
  19: "019", 20: "020", 21: "021",
  51: "051", 52: "052", 53: "053",
  81: "081", 82: "082", 83: "083",
  201: "201", 202: "202", 203: "203",
  206: "206", 207: "207", 208: "208",
  211: "211", 212: "212", 213: "213",
}

const DOC_TIPO_MAP: Record<number, string> = {
  80: "80",  // CUIT
  86: "86",  // CUIL
  96: "96",  // DNI
  87: "87",  // CDI
  89: "89",  // LE
  90: "90",  // LC
  94: "94",  // Pasaporte
  99: "99",  // Sin identificar / consumidor final
  0: "99",
}

const MONEDA_MAP: Record<string, string> = {
  ARS: "PES",
  PES: "PES",
  USD: "DOL",
  DOL: "DOL",
  EUR: "060",
  BRL: "012",
}

function formatDateRG3683(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

function toFixed2(val: any): string {
  return Number(val || 0).toFixed(2)
}

function escapeCSVField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

/**
 * Breaks down IVA amounts by rate from invoice_items.
 * Returns an object with keys for each standard AFIP IVA rate.
 */
function getIVAByRate(items: any[]): Record<string, number> {
  const rates: Record<string, number> = {
    "27": 0,
    "21": 0,
    "10.5": 0,
    "5": 0,
    "2.5": 0,
  }
  if (!items || !Array.isArray(items)) return rates
  for (const item of items) {
    const pct = Number(item.iva_porcentaje || 0)
    const monto = Number(item.iva_monto || 0)
    if (pct === 27) rates["27"] += monto
    else if (pct === 21) rates["21"] += monto
    else if (pct === 10.5) rates["10.5"] += monto
    else if (pct === 5) rates["5"] += monto
    else if (pct === 2.5) rates["2.5"] += monto
    else rates["21"] += monto // default to 21% if unknown
  }
  return rates
}

/**
 * For purchase invoices that have a single iva_rate field,
 * map the total iva_amount to the correct rate bucket.
 */
function getIVAByRateFromSingle(ivaRate: number | null, ivaAmount: number): Record<string, number> {
  const rates: Record<string, number> = {
    "27": 0,
    "21": 0,
    "10.5": 0,
    "5": 0,
    "2.5": 0,
  }
  const rate = Number(ivaRate || 21)
  const amount = Number(ivaAmount || 0)
  if (rate === 27) rates["27"] = amount
  else if (rate === 10.5) rates["10.5"] = amount
  else if (rate === 5) rates["5"] = amount
  else if (rate === 2.5) rates["2.5"] = amount
  else rates["21"] = amount
  return rates
}

function generateRG3683CSV(ventas: any[], compras: any[], year: number, month: number) {
  const ventasLines: string[] = []
  const comprasLines: string[] = []

  // ── Libro IVA Ventas (RG 3683) ──
  ventasLines.push([
    "Fecha",
    "Tipo Comprobante",
    "Punto de Venta",
    "Número Desde",
    "Número Hasta",
    "Código Doc Receptor",
    "Nro Doc Receptor",
    "Apellido y Nombre / Razón Social",
    "Importe Total",
    "Importe No Gravado",
    "Importe Operaciones Exentas",
    "Percepciones IVA",
    "IVA 27%",
    "IVA 21%",
    "IVA 10.5%",
    "IVA 5%",
    "IVA 2.5%",
    "Percepciones IIBB",
    "Percepciones Municipales",
    "Impuestos Internos",
    "Moneda",
    "Tipo Cambio",
  ].join(","))

  for (const inv of ventas) {
    const fecha = formatDateRG3683(inv.created_at)
    const cbteTipo = CBTE_TIPO_MAP[inv.cbte_tipo] || String(inv.cbte_tipo).padStart(3, "0")
    const ptoVta = String(inv.pto_vta).padStart(5, "0")
    const cbteNro = String(inv.cbte_nro || 0).padStart(8, "0")
    const docTipo = DOC_TIPO_MAP[inv.receptor_doc_tipo] || "99"
    const docNro = String(inv.receptor_doc_nro || "0")
    const nombre = escapeCSVField(inv.receptor_nombre || "CONSUMIDOR FINAL")
    const moneda = MONEDA_MAP[(inv.moneda || "ARS").toUpperCase()] || "PES"
    const tipoCambio = toFixed2(inv.cotizacion || 1)

    const ivaByRate = getIVAByRate(inv.invoice_items)

    ventasLines.push([
      fecha,
      cbteTipo,
      ptoVta,
      cbteNro,
      cbteNro, // Número Hasta = same as Desde for electronic invoices
      docTipo,
      docNro,
      nombre,
      toFixed2(inv.imp_total),
      toFixed2(inv.imp_tot_conc),
      toFixed2(inv.imp_op_ex),
      toFixed2(0), // Percepciones IVA (ventas typically 0)
      toFixed2(ivaByRate["27"]),
      toFixed2(ivaByRate["21"]),
      toFixed2(ivaByRate["10.5"]),
      toFixed2(ivaByRate["5"]),
      toFixed2(ivaByRate["2.5"]),
      toFixed2(0), // Percepciones IIBB
      toFixed2(0), // Percepciones Municipales
      toFixed2(inv.imp_trib), // Impuestos Internos
      moneda,
      tipoCambio,
    ].join(","))
  }

  // ── Libro IVA Compras (RG 3683) ──
  comprasLines.push([
    "Fecha",
    "Tipo Comprobante",
    "Punto de Venta",
    "Número Desde",
    "Número Hasta",
    "Código Doc Emisor",
    "Nro Doc Emisor",
    "Apellido y Nombre / Razón Social",
    "Importe Total",
    "Importe No Gravado",
    "Importe Operaciones Exentas",
    "IVA 27%",
    "IVA 21%",
    "IVA 10.5%",
    "IVA 5%",
    "IVA 2.5%",
    "Percepciones IVA",
    "Percepciones IIBB",
    "Percepciones Municipales",
    "Impuestos Internos",
    "Moneda",
    "Tipo Cambio",
  ].join(","))

  for (const inv of compras) {
    const fecha = inv.invoice_date
      ? formatDateRG3683(inv.invoice_date + "T12:00:00")
      : ""

    // Parse invoice_number to extract type, punto de venta, and number
    // Expected formats: "A-0001-00000123", "FA-A 0001-00000123", or raw number
    let cbteTipo = "001"
    let ptoVta = "00001"
    let cbteNro = "00000000"

    const invoiceType = inv.invoice_type || ""
    if (invoiceType === "FACTURA_A" || invoiceType === "FA-A") cbteTipo = "001"
    else if (invoiceType === "NOTA_DEBITO_A" || invoiceType === "ND-A") cbteTipo = "002"
    else if (invoiceType === "NOTA_CREDITO_A" || invoiceType === "NC-A") cbteTipo = "003"
    else if (invoiceType === "FACTURA_B" || invoiceType === "FA-B") cbteTipo = "006"
    else if (invoiceType === "NOTA_DEBITO_B" || invoiceType === "ND-B") cbteTipo = "007"
    else if (invoiceType === "NOTA_CREDITO_B" || invoiceType === "NC-B") cbteTipo = "008"
    else if (invoiceType === "FACTURA_C" || invoiceType === "FA-C") cbteTipo = "011"
    else if (invoiceType === "NOTA_DEBITO_C" || invoiceType === "ND-C") cbteTipo = "012"
    else if (invoiceType === "NOTA_CREDITO_C" || invoiceType === "NC-C") cbteTipo = "013"

    // Try to parse punto de venta and number from invoice_number
    const invNumStr = String(inv.invoice_number || "")
    const numMatch = invNumStr.match(/(\d{1,5})\s*[-]\s*(\d{1,8})/)
    if (numMatch) {
      ptoVta = numMatch[1].padStart(5, "0")
      cbteNro = numMatch[2].padStart(8, "0")
    } else {
      cbteNro = invNumStr.replace(/\D/g, "").padStart(8, "0") || "00000000"
    }

    const docTipo = "80" // Purchase invoices are always from CUIT holders
    const docNro = String(inv.emitter_cuit || "0")
    const nombre = escapeCSVField(inv.emitter_name || "")
    const moneda = MONEDA_MAP[(inv.currency || "ARS").toUpperCase()] || "PES"
    const tipoCambio = toFixed2(moneda === "PES" ? 1 : 1) // Default 1, should come from invoice if available

    const ivaByRate = getIVAByRateFromSingle(inv.iva_rate, inv.iva_amount)

    comprasLines.push([
      fecha,
      cbteTipo,
      ptoVta,
      cbteNro,
      cbteNro,
      docTipo,
      docNro,
      nombre,
      toFixed2(inv.total_amount),
      toFixed2(0), // Importe No Gravado (not tracked separately in purchase_invoices)
      toFixed2(0), // Importe Operaciones Exentas
      toFixed2(ivaByRate["27"]),
      toFixed2(ivaByRate["21"]),
      toFixed2(ivaByRate["10.5"]),
      toFixed2(ivaByRate["5"]),
      toFixed2(ivaByRate["2.5"]),
      toFixed2(inv.perception_iva),
      toFixed2(inv.perception_iibb),
      toFixed2(0), // Percepciones Municipales
      toFixed2(inv.other_taxes),
      moneda,
      tipoCambio,
    ].join(","))
  }

  // Combine both books into a single CSV with a separator
  const csv = [
    "LIBRO IVA DIGITAL - RG 3683",
    `Período: ${String(month).padStart(2, "0")}/${year}`,
    "",
    "=== LIBRO IVA VENTAS ===",
    ...ventasLines,
    "",
    "=== LIBRO IVA COMPRAS ===",
    ...comprasLines,
  ].join("\n")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="libro-iva-rg3683-${year}-${String(month).padStart(2, "0")}.csv"`,
    },
  })
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
