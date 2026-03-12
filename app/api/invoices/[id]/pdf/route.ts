import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { canAccessModule } from "@/lib/permissions"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib"
import { COMPROBANTE_LABELS } from "@/lib/afip/types"

export const dynamic = "force-dynamic"

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (s?: string | null) => {
  if (!s) return "-"
  // ISO date or YYYYMMDD
  if (s.length === 8) return `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)}`
  try { return new Date(s).toLocaleDateString("es-AR") } catch { return s }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Factura + items
    const { data: invoice, error: fetchError } = await (supabase.from("invoices") as any)
      .select("*, invoice_items (*)")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    // Agencia
    const { data: agency } = await (supabase.from("agencies") as any)
      .select("id, name")
      .eq("id", invoice.agency_id)
      .single()

    // Config AFIP → CUIT emisor
    const afipConfig = await getAfipConfigForAgency(supabase, invoice.agency_id)

    // ── Generar PDF ──────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage(PageSizes.A4) // 595 × 842 pt
    const { width, height } = page.getSize()

    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const black  = rgb(0, 0, 0)
    const gray   = rgb(0.45, 0.45, 0.45)
    const light  = rgb(0.92, 0.92, 0.92)
    const orange = rgb(0.85, 0.33, 0.1)

    const L = 40          // left margin
    const R = width - 40  // right margin
    const W = R - L       // usable width
    let y = height - 40   // current y (top → down)

    const line = (x1: number, y1: number, x2: number, y2: number, color = black, t = 0.5) => {
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color })
    }
    const rect = (x: number, ry: number, w: number, h: number, fillColor = light) => {
      page.drawRectangle({ x, y: ry, width: w, height: h, color: fillColor })
    }
    const text = (t: string, x: number, ty: number, size = 9, font = regular, color = black) => {
      page.drawText(t, { x, y: ty, size, font, color })
    }

    // ── HEADER ────────────────────────────────────────────────────────────
    rect(L, y - 54, W, 56, orange)
    text("FACTURA ELECTRÓNICA", L + 8, y - 16, 14, bold, rgb(1,1,1))
    const comprobanteLabel = COMPROBANTE_LABELS[invoice.cbte_tipo as keyof typeof COMPROBANTE_LABELS] ?? `Tipo ${invoice.cbte_tipo}`
    text(comprobanteLabel.toUpperCase(), L + 8, y - 32, 11, bold, rgb(1,1,1))
    if (invoice.cbte_nro) {
      const nroStr = `${String(invoice.pto_vta).padStart(4,"0")}-${String(invoice.cbte_nro).padStart(8,"0")}`
      text(`Nro: ${nroStr}`, R - 130, y - 22, 10, bold, rgb(1,1,1))
    }
    text(`P. Venta: ${String(invoice.pto_vta).padStart(4,"0")}`, R - 130, y - 36, 9, regular, rgb(1,1,1))
    y -= 60

    // ── EMISOR / RECEPTOR en dos columnas ────────────────────────────────
    const mid = L + W / 2
    const rowH = 14

    rect(L, y - 52, W / 2 - 2, 54, light)
    rect(mid + 2, y - 52, W / 2 - 2, 54, light)

    text("EMISOR", L + 6, y - 10, 8, bold, gray)
    text(agency?.name ?? "Agencia", L + 6, y - 22, 9, bold)
    if (afipConfig?.cuit) {
      const c = afipConfig.cuit
      text(`CUIT: ${c.slice(0,2)}-${c.slice(2,-1)}-${c.slice(-1)}`, L + 6, y - 34, 9, regular)
    }
    text("Responsable Inscripto", L + 6, y - 46, 8, regular, gray)

    text("RECEPTOR", mid + 8, y - 10, 8, bold, gray)
    text(invoice.receptor_nombre, mid + 8, y - 22, 9, bold)
    const docLabel = invoice.receptor_doc_tipo === 99 ? "Doc" : invoice.receptor_doc_tipo === 80 ? "CUIT" : "DNI"
    text(`${docLabel}: ${invoice.receptor_doc_nro}`, mid + 8, y - 34, 9, regular)
    const condStr = invoice.receptor_condicion_iva === 5 ? "Consumidor Final"
      : invoice.receptor_condicion_iva === 1 ? "Responsable Inscripto"
      : invoice.receptor_condicion_iva === 6 ? "Monotributista"
      : "Consumidor Final"
    text(condStr, mid + 8, y - 46, 8, regular, gray)
    y -= 60

    // ── FECHAS ────────────────────────────────────────────────────────────
    const fechaEmision = invoice.fecha_emision ?? invoice.created_at
    text(`Fecha de emisión: ${fmtDate(fechaEmision)}`, L, y, 8, regular, gray)
    if (invoice.fch_serv_desde) {
      text(`Periodo: ${fmtDate(invoice.fch_serv_desde)} al ${fmtDate(invoice.fch_serv_hasta)}`, mid, y, 8, regular, gray)
    }
    y -= 18

    // ── TABLA ITEMS ───────────────────────────────────────────────────────
    // Header row
    const colDesc  = L
    const colQty   = L + W * 0.52
    const colPrice = L + W * 0.63
    const colIva   = L + W * 0.76
    const colTotal = L + W * 0.87

    rect(L, y - rowH, W, rowH + 2, rgb(0.2, 0.2, 0.2))
    text("DESCRIPCIÓN",       colDesc  + 4, y - rowH + 4, 8, bold, rgb(1,1,1))
    text("CANT.",             colQty   + 2, y - rowH + 4, 8, bold, rgb(1,1,1))
    text("P. UNIT.",          colPrice + 2, y - rowH + 4, 8, bold, rgb(1,1,1))
    text("IVA%",              colIva   + 2, y - rowH + 4, 8, bold, rgb(1,1,1))
    text("TOTAL",             colTotal + 2, y - rowH + 4, 8, bold, rgb(1,1,1))
    y -= rowH + 4

    const items: any[] = invoice.invoice_items ?? []
    items.forEach((item, i) => {
      const rowColor = i % 2 === 0 ? rgb(1,1,1) : light
      rect(L, y - rowH, W, rowH + 1, rowColor)

      // Truncar descripción larga
      const maxDescChars = 42
      const desc = item.descripcion.length > maxDescChars
        ? item.descripcion.slice(0, maxDescChars) + "..."
        : item.descripcion

      text(desc,                            colDesc  + 4, y - rowH + 3, 8, regular)
      text(String(item.cantidad),           colQty   + 2, y - rowH + 3, 8, regular)
      text(`$${fmt(item.precio_unitario)}`, colPrice + 2, y - rowH + 3, 8, regular)
      text(`${item.iva_porcentaje}%`,       colIva   + 2, y - rowH + 3, 8, regular)
      text(`$${fmt(item.total)}`,           colTotal + 2, y - rowH + 3, 8, regular)
      y -= rowH + 2
    })

    line(L, y, R, y)
    y -= 10

    // ── TOTALES ───────────────────────────────────────────────────────────
    const totW = 160
    const totX = R - totW

    const addTotalRow = (label: string, value: number, isBold = false) => {
      text(label, totX, y, 9, isBold ? bold : regular, isBold ? black : gray)
      text(`$${fmt(value)}`, R - 4 - regular.widthOfTextAtSize(`$${fmt(value)}`, 9), y, 9, isBold ? bold : regular)
      y -= 14
    }

    addTotalRow("Subtotal (neto):", invoice.imp_neto ?? 0)
    addTotalRow("IVA:",             invoice.imp_iva ?? 0)
    addTotalRow("TOTAL:",           invoice.imp_total, true)
    if (invoice.moneda === "DOL") {
      y -= 2
      text(`(USD × ${fmt(invoice.cotizacion ?? 1)} ARS/USD)`, totX, y, 7, regular, gray)
      y -= 12
    }
    y -= 6

    // ── CAE BOX ───────────────────────────────────────────────────────────
    if (invoice.cae) {
      const boxH = 52
      rect(L, y - boxH, W, boxH, rgb(0.95, 0.98, 0.95))
      line(L, y - boxH, R, y - boxH, rgb(0.3, 0.65, 0.3), 0.8)
      line(L, y,        R, y,        rgb(0.3, 0.65, 0.3), 0.8)

      text("COMPROBANTE AUTORIZADO POR AFIP", L + 8, y - 12, 9, bold, rgb(0.1, 0.5, 0.1))
      text(`CAE Nro: ${invoice.cae}`,           L + 8, y - 26, 9, regular)
      text(`Vencimiento CAE: ${fmtDate(invoice.cae_fch_vto)}`, L + 8, y - 38, 9, regular)
      text(`Comprobante: ${String(invoice.pto_vta).padStart(4,"0")}-${String(invoice.cbte_nro).padStart(8,"0")}`, R - 200, y - 26, 9, regular)
      y -= boxH + 10
    }

    // ── FOOTER ────────────────────────────────────────────────────────────
    line(L, 35, R, 35, gray, 0.3)
    text("Comprobante generado por maxeva - Sistema de Gestion de Agencias de Viajes", L, 22, 7, regular, gray)
    text("Verificá en: www.afip.gob.ar/fe/qr", R - 160, 22, 7, regular, gray)

    const pdfBytes = await pdfDoc.save()

    const compStr = invoice.cbte_nro
      ? `${String(invoice.pto_vta).padStart(4,"0")}-${String(invoice.cbte_nro).padStart(8,"0")}`
      : id.slice(0, 8)

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${compStr}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error)
    return NextResponse.json({ error: error.message || "Error al generar PDF" }, { status: 500 })
  }
}
