/**
 * Renderer de facturas electrónicas AFIP a PDF.
 *
 * Pure function: recibe los datos denormalizados (invoice + items + emisor +
 * agency) y devuelve Uint8Array del PDF. No toca Supabase ni request.
 *
 * Incluye el QR oficial AFIP (RG 4291) en el footer cuando hay CAE.
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib"
import QRCode from "qrcode"
import { COMPROBANTE_LABELS } from "@/lib/afip/types"
import {
  formatInvoiceMoney,
  ITEM_TAX_TREATMENT_LABELS,
  shouldHideInvoiceTaxBreakdown,
} from "@/lib/invoices/calculation"
import { buildAfipQrPayload, buildAfipQrUrl } from "@/lib/afip/qr"

export interface InvoicePdfParams {
  invoice: any
  emisor: { cuit: string; razonSocial: string }
  agency: { name: string }
  footerCompanyName?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (s?: string | null) => {
  if (!s) return "-"
  if (s.length === 8) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  try {
    return new Date(s).toLocaleDateString("es-AR")
  } catch {
    return s
  }
}

export async function renderInvoicePdf(params: InvoicePdfParams): Promise<Uint8Array> {
  const { invoice, emisor, agency, footerCompanyName } = params

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage(PageSizes.A4) // 595 × 842 pt
  const { width, height } = page.getSize()

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const black = rgb(0, 0, 0)
  const gray = rgb(0.45, 0.45, 0.45)
  const light = rgb(0.92, 0.92, 0.92)
  const orange = rgb(0.85, 0.33, 0.1)

  const L = 40
  const R = width - 40
  const W = R - L
  let y = height - 40

  const line = (x1: number, y1: number, x2: number, y2: number, color = black, t = 0.5) => {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color })
  }
  const rect = (x: number, ry: number, w: number, h: number, fillColor = light) => {
    page.drawRectangle({ x, y: ry, width: w, height: h, color: fillColor })
  }
  const text = (t: string, x: number, ty: number, size = 9, font = regular, color = black) => {
    page.drawText(t, { x, y: ty, size, font, color })
  }

  const hideTaxBreakdown = shouldHideInvoiceTaxBreakdown({
    amountEntryMode: invoice.amount_entry_mode,
    cbteTipo: invoice.cbte_tipo,
    receptorCondicionIva: invoice.receptor_condicion_iva,
  })
  const fmtMoney = (value: number) => formatInvoiceMoney(value, invoice.moneda)

  // HEADER
  rect(L, y - 54, W, 56, orange)
  text("FACTURA ELECTRÓNICA", L + 8, y - 16, 14, bold, rgb(1, 1, 1))
  const comprobanteLabel =
    COMPROBANTE_LABELS[invoice.cbte_tipo as keyof typeof COMPROBANTE_LABELS] ??
    `Tipo ${invoice.cbte_tipo}`
  text(comprobanteLabel.toUpperCase(), L + 8, y - 32, 11, bold, rgb(1, 1, 1))
  if (invoice.cbte_nro) {
    const nroStr = `${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`
    text(`Nro: ${nroStr}`, R - 130, y - 22, 10, bold, rgb(1, 1, 1))
  }
  text(`P. Venta: ${String(invoice.pto_vta).padStart(4, "0")}`, R - 130, y - 36, 9, regular, rgb(1, 1, 1))
  y -= 60

  // EMISOR / RECEPTOR
  const mid = L + W / 2
  rect(L, y - 52, W / 2 - 2, 54, light)
  rect(mid + 2, y - 52, W / 2 - 2, 54, light)

  text("EMISOR", L + 6, y - 10, 8, bold, gray)
  text(agency.name, L + 6, y - 22, 9, bold)
  if (emisor.cuit) {
    const c = emisor.cuit
    text(`CUIT: ${c.slice(0, 2)}-${c.slice(2, -1)}-${c.slice(-1)}`, L + 6, y - 34, 9, regular)
  }
  text("Responsable Inscripto", L + 6, y - 46, 8, regular, gray)

  text("RECEPTOR", mid + 8, y - 10, 8, bold, gray)
  text(invoice.receptor_nombre, mid + 8, y - 22, 9, bold)
  const docLabel =
    invoice.receptor_doc_tipo === 99 ? "Doc"
    : invoice.receptor_doc_tipo === 80 ? "CUIT"
    : invoice.receptor_doc_tipo === 86 ? "CUIL"
    : "DNI"
  text(`${docLabel}: ${invoice.receptor_doc_nro}`, mid + 8, y - 34, 9, regular)
  const condStr =
    invoice.receptor_condicion_iva === 5 ? "Consumidor Final"
    : invoice.receptor_condicion_iva === 1 ? "Responsable Inscripto"
    : invoice.receptor_condicion_iva === 6 ? "Monotributista"
    : "Consumidor Final"
  text(condStr, mid + 8, y - 46, 8, regular, gray)
  y -= 60

  // FECHAS
  const fechaEmision = invoice.fecha_emision ?? invoice.created_at
  text(`Fecha de emisión: ${fmtDate(fechaEmision)}`, L, y, 8, regular, gray)
  if (invoice.fch_serv_desde) {
    text(`Periodo: ${fmtDate(invoice.fch_serv_desde)} al ${fmtDate(invoice.fch_serv_hasta)}`, mid, y, 8, regular, gray)
  }
  y -= 18

  // TABLA ITEMS
  const rowH = 14
  const colDesc = L
  const colQty = L + W * 0.52
  const colPrice = L + W * 0.63
  const colIva = L + W * 0.76
  const colTotal = L + W * 0.87

  rect(L, y - rowH, W, rowH + 2, rgb(0.2, 0.2, 0.2))
  text("DESCRIPCIÓN", colDesc + 4, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text("CANT.", colQty + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text("P. UNIT.", colPrice + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text(hideTaxBreakdown ? "TRAT." : "IVA%", colIva + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text("TOTAL", colTotal + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  y -= rowH + 4

  const items: any[] = invoice.invoice_items ?? []
  items.forEach((item, i) => {
    const rowColor = i % 2 === 0 ? rgb(1, 1, 1) : light
    rect(L, y - rowH, W, rowH + 1, rowColor)
    const taxTreatment = (item.tax_treatment || (item.iva_porcentaje === 0 ? "EXENTO" : "GRAVADO")) as keyof typeof ITEM_TAX_TREATMENT_LABELS
    const maxDescChars = 42
    const desc = item.descripcion.length > maxDescChars ? item.descripcion.slice(0, maxDescChars) + "..." : item.descripcion

    text(desc, colDesc + 4, y - rowH + 3, 8, regular)
    text(String(item.cantidad), colQty + 2, y - rowH + 3, 8, regular)
    text(fmtMoney(item.precio_unitario), colPrice + 2, y - rowH + 3, 8, regular)
    text(
      hideTaxBreakdown
        ? ITEM_TAX_TREATMENT_LABELS[taxTreatment]
        : `${item.iva_porcentaje}%`,
      colIva + 2,
      y - rowH + 3,
      8,
      regular
    )
    text(fmtMoney(item.total), colTotal + 2, y - rowH + 3, 8, regular)
    y -= rowH + 2
  })

  line(L, y, R, y)
  y -= 10

  // TOTALES
  const totW = 160
  const totX = R - totW
  const addTotalRow = (label: string, value: number, isBold = false) => {
    text(label, totX, y, 9, isBold ? bold : regular, isBold ? black : gray)
    const valueLabel = fmtMoney(value)
    text(valueLabel, R - 4 - regular.widthOfTextAtSize(valueLabel, 9), y, 9, isBold ? bold : regular)
    y -= 14
  }

  if (!hideTaxBreakdown && Number(invoice.imp_neto || 0) > 0) addTotalRow("Neto gravado:", invoice.imp_neto ?? 0)
  if (!hideTaxBreakdown && Number(invoice.imp_tot_conc || 0) > 0) addTotalRow("No gravado:", invoice.imp_tot_conc ?? 0)
  if (!hideTaxBreakdown && Number(invoice.imp_op_ex || 0) > 0) addTotalRow("Exento:", invoice.imp_op_ex ?? 0)
  if (!hideTaxBreakdown && Number(invoice.imp_iva || 0) > 0) addTotalRow("IVA:", invoice.imp_iva ?? 0)
  addTotalRow(hideTaxBreakdown ? "TOTAL FINAL:" : "TOTAL:", invoice.imp_total, true)

  if (hideTaxBreakdown) {
    y -= 2
    text("IVA no discriminado en la presentacion al cliente.", totX, y, 7, regular, gray)
    y -= 12
  }
  if (invoice.moneda === "DOL") {
    y -= 2
    text(`(USD × ${fmt(invoice.cotizacion ?? 1)} ARS/USD)`, totX, y, 7, regular, gray)
    y -= 12
  }
  y -= 6

  // CAE BOX + QR
  if (invoice.cae) {
    const boxH = 90
    rect(L, y - boxH, W, boxH, rgb(0.95, 0.98, 0.95))
    line(L, y - boxH, R, y - boxH, rgb(0.3, 0.65, 0.3), 0.8)
    line(L, y, R, y, rgb(0.3, 0.65, 0.3), 0.8)

    text("COMPROBANTE AUTORIZADO POR AFIP", L + 8, y - 14, 9, bold, rgb(0.1, 0.5, 0.1))
    text(`CAE Nro: ${invoice.cae}`, L + 8, y - 30, 9, regular)
    text(`Vencimiento CAE: ${fmtDate(invoice.cae_fch_vto)}`, L + 8, y - 44, 9, regular)
    text(
      `Comprobante: ${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`,
      L + 8,
      y - 58,
      9,
      regular
    )

    // QR AFIP oficial (embed PNG)
    const qrPayload = buildAfipQrPayload(invoice, emisor.cuit)
    const qrUrl = buildAfipQrUrl(qrPayload)
    const qrPngBuffer = await QRCode.toBuffer(qrUrl, {
      errorCorrectionLevel: "M",
      width: 160,
      margin: 1,
    })
    const qrImage = await pdfDoc.embedPng(qrPngBuffer)
    const qrSize = 72
    page.drawImage(qrImage, { x: R - 8 - qrSize, y: y - boxH + 8, width: qrSize, height: qrSize })
    text("Verificá en AFIP", R - 8 - qrSize, y - 14, 7, regular, gray)

    y -= boxH + 10
  }

  // FOOTER
  const company = footerCompanyName || agency.name
  line(L, 35, R, 35, gray, 0.3)
  text(`Comprobante generado por ${company} - Sistema de Gestion`, L, 22, 7, regular, gray)
  text("Verificá en: www.afip.gob.ar/fe/qr", R - 160, 22, 7, regular, gray)

  return await pdfDoc.save()
}
