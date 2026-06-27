import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeTaxTreatment } from "@/lib/invoices/calculation"
import { ledgerSign } from "@/lib/invoices/credit-note"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"
import { bundleLibroIvaDigital } from "@/lib/accounting/libro-iva-digital"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Cross-tenant fix (2026-05-18): exigir org_id explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())
    const format = searchParams.get("format") || "json" // json, csv, or rg3683

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    // ── LIBRO IVA VENTAS ──
    // From invoices table (facturas emitidas con CAE) — scopeado por org
    const { data: invoices, error: invoicesError } = await (supabase.from("invoices") as any)
      .select(`
        id, cbte_tipo, pto_vta, cbte_nro, cae, cae_fch_vto,
        receptor_doc_tipo, receptor_doc_nro, receptor_nombre,
        imp_neto, imp_iva, imp_total, imp_tot_conc, imp_op_ex, imp_trib,
        moneda, cotizacion, concepto, created_at,
        invoice_items (descripcion, cantidad, precio_unitario, iva_porcentaje, tax_treatment, subtotal, iva_importe)
      `)
      .eq("org_id", (user as any).org_id)
      .gte("created_at", startOfDayAR(startDate))
      .lte("created_at", endOfDayAR(endDate))
      .eq("status", "authorized")
      .order("created_at", { ascending: true })

    if (invoicesError) {
      console.error("Error querying invoices for libro IVA:", invoicesError)
    }

    // Also from iva_sales (scopeado por org)
    const { data: ivaSales } = await (supabase.from("iva_sales") as any)
      .select(`
        id, operation_id, sale_amount_total, net_amount, iva_amount, currency, sale_date,
        operations:operation_id (id, file_code, destination)
      `)
      .eq("org_id", (user as any).org_id)
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("sale_date", { ascending: true })

    // ── LIBRO IVA COMPRAS ──
    const { data: purchaseInvoices } = await (supabase.from("purchase_invoices") as any)
      .select(`
        id, invoice_type, invoice_number, invoice_date,
        emitter_cuit, emitter_name,
        currency, net_amount, iva_rate, iva_amount,
        perception_iva, perception_iibb, other_taxes, total_amount,
        operators:operator_id (id, name)
      `)
      .eq("org_id", (user as any).org_id)
      .gte("invoice_date", startDate)
      .lte("invoice_date", endDate)
      .order("invoice_date", { ascending: true })

    // iva_purchases scopeado por org
    const { data: ivaPurchases } = await (supabase.from("iva_purchases") as any)
      .select(`
        id, operation_id, operator_cost_total, net_amount, iva_amount, currency, purchase_date,
        operations:operation_id (id, file_code, destination),
        operators:operator_id (id, name)
      `)
      .eq("org_id", (user as any).org_id)
      .gte("purchase_date", startDate)
      .lte("purchase_date", endDate)
      .order("purchase_date", { ascending: true })

    // ── PERCEPCIONES del período ──
    const taxPeriod = `${year}-${String(month).padStart(2, "0")}`
    const { data: percepciones } = await (supabase.from("tax_withholdings") as any)
      .select("*")
      .eq("tax_period", taxPeriod)
      .eq("direction", "SUFFERED")
      .eq("org_id", (user as any).org_id)

    // ── TOTALES ──
    const salesInvoices = invoices || []
    const salesIva = ivaSales || []
    const purchases = purchaseInvoices || []
    const purchasesIva = ivaPurchases || []
    const percs = percepciones || []

    const totals = {
      // Las NC (3/8/13/21) restan del débito fiscal; facturas y ND suman (ledgerSign).
      // Los exports por comprobante (RG3683/RG4597) conservan montos positivos:
      // AFIP aplica el signo según el tipo de comprobante.
      ventas: {
        neto: salesInvoices.reduce((s: number, i: any) => s + ledgerSign(i.cbte_tipo) * Number(i.imp_neto || 0), 0),
        iva: salesInvoices.reduce((s: number, i: any) => s + ledgerSign(i.cbte_tipo) * Number(i.imp_iva || 0), 0),
        total: salesInvoices.reduce((s: number, i: any) => s + ledgerSign(i.cbte_tipo) * Number(i.imp_total || 0), 0),
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

    if (format === "rg4597") {
      return await generateRG4597Zip(salesInvoices, purchases, year, month)
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
    if (normalizeTaxTreatment(item.tax_treatment, item.iva_porcentaje) !== "GRAVADO") {
      continue
    }

    const pct = Number(item.iva_porcentaje || 0)
    const monto = Number(item.iva_importe || 0)
    if (pct === 27) rates["27"] += monto
    else if (pct === 21) rates["21"] += monto
    else if (pct === 10.5) rates["10.5"] += monto
    else if (pct === 5) rates["5"] += monto
    else if (pct === 2.5) rates["2.5"] += monto
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

// ── AFIP RG 4597 (Libro IVA Digital) — generador ZIP ──

async function generateRG4597Zip(
  ventas: any[],
  compras: any[],
  year: number,
  month: number,
) {
  // Mapping ventas: invoices con invoice_items[] y campos AFIP nativos
  const ventasInputs = ventas.map((inv) => {
    const ivaByRate = getIVAByRate(inv.invoice_items)
    const cantAlicuotas = Object.values(ivaByRate).filter((v) => v > 0).length || 1
    return {
      issue_date: inv.created_at,
      cbte_tipo: Number(inv.cbte_tipo) || 1,
      pto_vta: Number(inv.pto_vta) || 1,
      cbte_nro: Number(inv.cbte_nro) || 0,
      receptor_doc_tipo: Number(inv.receptor_doc_tipo) || 99,
      receptor_doc_nro: String(inv.receptor_doc_nro || "0"),
      receptor_nombre: inv.receptor_nombre || "CONSUMIDOR FINAL",
      imp_total: Number(inv.imp_total) || 0,
      imp_tot_conc: Number(inv.imp_tot_conc) || 0,
      imp_op_ex: Number(inv.imp_op_ex) || 0,
      imp_iva: Number(inv.imp_iva) || 0,
      perc_iva: 0,
      perc_iibb: 0,
      perc_municipales: 0,
      imp_internos: Number(inv.imp_trib) || 0,
      moneda: inv.moneda || "ARS",
      cotizacion: Number(inv.cotizacion) || 1,
      cantidad_alicuotas: cantAlicuotas,
      codigo_operacion: " ",
      otros_tributos: 0,
      fecha_vto_pago: null,
    }
  })

  // ventas_alicuotas — una entrada por (invoice × rate gravado)
  const ventasAlicuotasInputs = ventas.map((inv) => {
    const ivaByRate = getIVAByRate(inv.invoice_items)
    const breakdown: Record<string, { neto: number; iva: number }> = {}
    for (const [rate, ivaAmount] of Object.entries(ivaByRate)) {
      if (ivaAmount > 0) {
        // Reconstruir neto desde line items con esta tasa
        const items = (inv.invoice_items || []).filter((it: any) => {
          const tt = normalizeTaxTreatment(it.tax_treatment, it.iva_porcentaje)
          return tt === "GRAVADO" && Number(it.iva_porcentaje) === Number(rate)
        })
        const neto = items.reduce((s: number, it: any) => s + Number(it.subtotal || 0), 0)
        breakdown[rate] = { neto, iva: ivaAmount }
      }
    }
    return {
      cbte_tipo: Number(inv.cbte_tipo) || 1,
      pto_vta: Number(inv.pto_vta) || 1,
      cbte_nro: Number(inv.cbte_nro) || 0,
      iva_breakdown: breakdown,
    }
  })

  // Mapping compras: purchase_invoices (single iva_rate por invoice)
  const comprasInputs = compras.map((inv) => {
    // Parse "0001-00000099" → pto_vta=1, cbte_nro=99
    let ptoVta = 1
    let cbteNro = 0
    const numMatch = String(inv.invoice_number || "").match(/(\d{1,5})\s*[-]\s*(\d{1,8})/)
    if (numMatch) {
      ptoVta = Number(numMatch[1])
      cbteNro = Number(numMatch[2])
    } else {
      cbteNro = Number(String(inv.invoice_number || "").replace(/\D/g, "")) || 0
    }

    return {
      issue_date: inv.invoice_date,
      cbte_tipo: inv.invoice_type || "FACTURA_A",
      pto_vta: ptoVta,
      cbte_nro: cbteNro,
      despacho_importacion: null,
      emitter_doc_tipo: 80,
      emitter_cuit: inv.emitter_cuit || null,
      emitter_name: inv.emitter_name || "",
      imp_total: Number(inv.total_amount) || 0,
      imp_tot_conc: 0,
      imp_op_ex: 0,
      perc_iva: Number(inv.perception_iva) || 0,
      perc_no_categorizados: 0,
      perc_iibb: Number(inv.perception_iibb) || 0,
      perc_municipales: 0,
      imp_internos: Number(inv.other_taxes) || 0,
      moneda: inv.currency || "ARS",
      cotizacion: 1,
      cantidad_alicuotas: 1,
      codigo_operacion: " ",
      credito_fiscal_computable: Number(inv.iva_amount) || 0,
      otros_tributos: 0,
      cuit_corredor: null,
      denominacion_corredor: null,
      iva_comision: 0,
    }
  })

  // compras_alicuotas — single rate per invoice (purchase_invoices schema legacy)
  const comprasAlicuotasInputs = compras.map((inv) => {
    let ptoVta = 1
    let cbteNro = 0
    const numMatch = String(inv.invoice_number || "").match(/(\d{1,5})\s*[-]\s*(\d{1,8})/)
    if (numMatch) {
      ptoVta = Number(numMatch[1])
      cbteNro = Number(numMatch[2])
    } else {
      cbteNro = Number(String(inv.invoice_number || "").replace(/\D/g, "")) || 0
    }

    const rate = Number(inv.iva_rate) || 21
    const breakdown: Record<string, { neto: number; iva: number }> = {}
    if (Number(inv.iva_amount) > 0) {
      breakdown[String(rate)] = {
        neto: Number(inv.net_amount) || 0,
        iva: Number(inv.iva_amount) || 0,
      }
    }

    return {
      cbte_tipo: inv.invoice_type || "FACTURA_A",
      pto_vta: ptoVta,
      cbte_nro: cbteNro,
      emitter_cuit: inv.emitter_cuit || null,
      iva_breakdown: breakdown,
    }
  })

  const bundle = await bundleLibroIvaDigital({
    ventas: ventasInputs,
    ventas_alicuotas: ventasAlicuotasInputs,
    compras: comprasInputs,
    compras_alicuotas: comprasAlicuotasInputs,
    year,
    month,
  })

  return new Response(new Uint8Array(bundle.zipBuffer) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bundle.filename}"`,
      "X-LIBRO-IVA-COUNTS": JSON.stringify(bundle.counts),
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
