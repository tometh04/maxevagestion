import jsPDF from "jspdf"

interface QuotationItem {
  item_type: string
  description: string
  quantity: number
  provider?: string
  hotel_name?: string
  hotel_stars?: number
  room_type?: string
  meal_plan?: string
  checkin_date?: string
  checkout_date?: string
  nights?: number
  airline?: string
  flight_route?: string
  flight_class?: string
}

interface QuotationOption {
  id: string
  option_number: number
  title: string
  total_amount: number
  is_selected?: boolean
  items: QuotationItem[]
}

interface QuotationPDFData {
  quotation_number: string
  destination: string
  origin?: string
  departure_date: string
  return_date?: string
  valid_until: string
  adults: number
  children: number
  infants: number
  currency: string
  status: string
  notes?: string
  terms_and_conditions?: string
  created_at: string
  seller_name: string
  agency_name: string
  options: QuotationOption[]
}

interface BrandingData {
  brand_color?: string
  brand_logo?: string
  company_name?: string
  company_address?: string
  company_phone?: string
  company_email?: string
  company_website?: string
  company_instagram?: string
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  FLIGHT: "Vuelo",
  ACCOMMODATION: "Hotel",
  TRANSFER: "Traslado",
  INSURANCE: "Asistencia",
  ACTIVITY: "Excursion",
  VISA: "Visa",
  OTHER: "Otro",
}

const MEAL_PLAN_LABELS: Record<string, string> = {
  SOLO_ALOJAMIENTO: "Solo alojamiento",
  DESAYUNO: "Desayuno incluido",
  MEDIA_PENSION: "Media pension",
  PENSION_COMPLETA: "Pension completa",
  ALL_INCLUSIVE: "All Inclusive",
}

function formatCurrency(amount: number, currency: string) {
  const prefix = currency === "USD" ? "US$" : "$"
  return `${prefix} ${Number(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00")
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [249, 115, 22] // orange fallback
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
}

export async function generateQuotationPDF(
  data: QuotationPDFData,
  branding: BrandingData
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = 20

  const brandColor = hexToRgb(branding.brand_color || "#f97316")
  const companyName = branding.company_name || data.agency_name

  // ── Header with brand color bar ──
  doc.setFillColor(...brandColor)
  doc.rect(0, 0, pageWidth, 4, "F")

  y = 16

  // Company name
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...brandColor)
  doc.text(companyName, margin, y)

  // Quotation number - right aligned
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(120, 120, 120)
  doc.text(`Cotizacion ${data.quotation_number}`, pageWidth - margin, y, { align: "right" })
  y += 6

  // Date and validity
  doc.setFontSize(8)
  doc.text(`Emitida: ${formatDate(data.created_at.split("T")[0])}`, pageWidth - margin, y, { align: "right" })
  y += 4
  doc.text(`Valida hasta: ${formatDate(data.valid_until)}`, pageWidth - margin, y, { align: "right" })

  // Company info below name
  if (branding.company_address || branding.company_phone || branding.company_email) {
    let infoY = 22
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    if (branding.company_address) {
      doc.text(branding.company_address, margin, infoY)
      infoY += 3
    }
    const contactParts = [branding.company_phone, branding.company_email].filter(Boolean)
    if (contactParts.length) {
      doc.text(contactParts.join(" | "), margin, infoY)
    }
  }

  y = 36

  // Separator line
  doc.setDrawColor(...brandColor)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // ── Trip Info Section ──
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(40, 40, 40)
  doc.text("Detalle del viaje", margin, y)
  y += 7

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(60, 60, 60)

  const tripInfo = [
    ["Destino", data.destination],
    ...(data.origin ? [["Origen", data.origin]] : []),
    ["Salida", formatDate(data.departure_date)],
    ...(data.return_date ? [["Regreso", formatDate(data.return_date)]] : []),
  ]

  // Passengers
  let paxText = `${data.adults} adulto${data.adults > 1 ? "s" : ""}`
  if (data.children > 0) paxText += `, ${data.children} menor${data.children > 1 ? "es" : ""}`
  if (data.infants > 0) paxText += `, ${data.infants} bebe${data.infants > 1 ? "s" : ""}`
  tripInfo.push(["Pasajeros", paxText])

  // Draw trip info in 2 columns
  const colWidth = contentWidth / 2
  tripInfo.forEach((info, idx) => {
    const xOffset = idx % 2 === 0 ? margin : margin + colWidth
    const yOffset = y + Math.floor(idx / 2) * 10

    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(info[0], xOffset, yOffset)
    doc.setFontSize(9)
    doc.setTextColor(40, 40, 40)
    doc.text(info[1], xOffset, yOffset + 4)
  })

  y += Math.ceil(tripInfo.length / 2) * 10 + 5

  // ── Options ──
  const totalPassengers = data.adults + data.children + data.infants

  for (const option of data.options.sort((a, b) => a.option_number - b.option_number)) {
    // Check if we need a new page
    if (y > pageHeight - 60) {
      doc.addPage()
      y = 20
    }

    // Option header
    doc.setFillColor(245, 245, 245)
    doc.roundedRect(margin, y - 4, contentWidth, 14, 2, 2, "F")

    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(40, 40, 40)
    doc.text(option.title, margin + 4, y + 3)

    // Price right-aligned
    doc.setTextColor(...brandColor)
    doc.text(formatCurrency(option.total_amount, data.currency), pageWidth - margin - 4, y + 3, { align: "right" })

    y += 14

    // Per person price
    if (totalPassengers > 1) {
      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(150, 150, 150)
      doc.text(
        `${formatCurrency(option.total_amount / totalPassengers, data.currency)} por persona`,
        pageWidth - margin - 4,
        y,
        { align: "right" }
      )
      y += 5
    }

    // Items
    for (const item of option.items) {
      if (y > pageHeight - 30) {
        doc.addPage()
        y = 20
      }

      const typeLabel = ITEM_TYPE_LABELS[item.item_type] || "Otro"

      // Type badge
      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...brandColor)
      doc.text(typeLabel.toUpperCase(), margin + 4, y)

      // Provider
      if (item.provider) {
        const typeLabelWidth = doc.getTextWidth(typeLabel.toUpperCase())
        doc.setFont("helvetica", "normal")
        doc.setTextColor(150, 150, 150)
        doc.text(`· ${item.provider}`, margin + 4 + typeLabelWidth + 2, y)
      }
      y += 4

      // Description
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(40, 40, 40)
      const descLines = doc.splitTextToSize(item.description, contentWidth - 10)
      doc.text(descLines, margin + 4, y)
      y += descLines.length * 4

      // Hotel details
      if (item.item_type === "ACCOMMODATION") {
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        const details: string[] = []
        if (item.hotel_name) details.push(item.hotel_name)
        if (item.hotel_stars) details.push("★".repeat(item.hotel_stars))
        if (item.room_type) details.push(item.room_type)
        if (item.meal_plan) details.push(MEAL_PLAN_LABELS[item.meal_plan] || item.meal_plan)
        if (item.nights) details.push(`${item.nights} noches`)
        if (item.checkin_date && item.checkout_date) {
          details.push(`${formatDate(item.checkin_date)} → ${formatDate(item.checkout_date)}`)
        }
        if (details.length > 0) {
          const detailLines = doc.splitTextToSize(details.join(" | "), contentWidth - 10)
          doc.text(detailLines, margin + 4, y)
          y += detailLines.length * 3 + 1
        }
      }

      // Flight details
      if (item.item_type === "FLIGHT") {
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        const details: string[] = []
        if (item.airline) details.push(item.airline)
        if (item.flight_route) details.push(item.flight_route)
        if (item.flight_class) details.push(item.flight_class)
        if (details.length > 0) {
          doc.text(details.join(" | "), margin + 4, y)
          y += 4
        }
      }

      y += 3
    }

    // Separator between options
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 6
  }

  // ── Notes ──
  if (data.notes) {
    if (y > pageHeight - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(100, 100, 100)
    doc.text("Notas:", margin, y)
    y += 4
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    const noteLines = doc.splitTextToSize(data.notes, contentWidth)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 3 + 4
  }

  // ── Terms ──
  if (data.terms_and_conditions) {
    if (y > pageHeight - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(7)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(130, 130, 130)
    doc.text("Terminos y Condiciones:", margin, y)
    y += 4
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6)
    doc.setTextColor(150, 150, 150)
    const termLines = doc.splitTextToSize(data.terms_and_conditions, contentWidth)
    doc.text(termLines, margin, y)
    y += termLines.length * 2.5 + 4
  }

  // ── Footer ──
  const footerY = pageHeight - 15
  doc.setDrawColor(...brandColor)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(150, 150, 150)
  doc.text(companyName, margin, footerY)
  doc.text(`Asesor: ${data.seller_name}`, margin, footerY + 3)

  const contactInfo = [branding.company_phone, branding.company_email, branding.company_website].filter(Boolean).join(" | ")
  if (contactInfo) {
    doc.text(contactInfo, pageWidth - margin, footerY, { align: "right" })
  }
  if (branding.company_instagram) {
    const ig = branding.company_instagram.startsWith("@") ? branding.company_instagram : `@${branding.company_instagram}`
    doc.text(ig, pageWidth - margin, footerY + 3, { align: "right" })
  }

  // Bottom brand bar
  doc.setFillColor(...brandColor)
  doc.rect(0, pageHeight - 4, pageWidth, 4, "F")

  return doc
}

export function downloadQuotationPDF(
  data: QuotationPDFData,
  branding: BrandingData
) {
  return generateQuotationPDF(data, branding).then((doc) => {
    doc.save(`${data.quotation_number}.pdf`)
  })
}
