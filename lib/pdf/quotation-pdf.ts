import jsPDF from "jspdf"
import {
  QUOTATION_AVAILABILITY_NOTE,
  formatQuotationCurrency,
  formatQuotationDateLong,
  formatQuotationDateShort,
  getQuotationOptionPricing,
  getQuotationPassengersText,
  QUOTATION_FLIGHT_CLASS_LABELS,
  QUOTATION_ITEM_LABELS,
  QUOTATION_MEAL_PLAN_LABELS,
  QUOTATION_STATUS_LABELS,
  type QuotationPresentationData,
  type QuotationPresentationItem,
} from "@/lib/quotations/presentation"

interface BrandingData {
  brand_color?: string
  company_name?: string
  company_address?: string
  company_phone?: string
  company_email?: string
  company_website?: string
  company_instagram?: string
  company_legajo?: string
  company_tax_id?: string
  legajo?: string
  tax_id?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  instagram?: string
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return [249, 115, 22]

  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ]
}

function tintColor([r, g, b]: [number, number, number], intensity: number): [number, number, number] {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  return [
    clamp(r + (255 - r) * intensity),
    clamp(g + (255 - g) * intensity),
    clamp(b + (255 - b) * intensity),
  ]
}

function getBrandingValue(branding: BrandingData, primary: keyof BrandingData, fallback?: keyof BrandingData) {
  return branding[primary] || (fallback ? branding[fallback] : undefined) || ""
}

function getItemTitle(item: QuotationPresentationItem) {
  switch (item.item_type) {
    case "ACCOMMODATION":
    case "HOTEL":
      return item.hotel_name || item.description || "Alojamiento"
    case "FLIGHT":
      return item.airline || item.flight_route || item.description || "Vuelo"
    case "TRANSFER":
      return item.transfer_description || item.description || "Traslado"
    default:
      return item.description || (QUOTATION_ITEM_LABELS[item.item_type] || "Servicio")
  }
}

function getItemLines(item: QuotationPresentationItem, currency: string) {
  const lines: string[] = []
  const title = getItemTitle(item)
  const normalizedDescription = item.description?.trim()

  if (
    normalizedDescription &&
    normalizedDescription !== title &&
    normalizedDescription !== item.transfer_description &&
    normalizedDescription !== item.flight_route
  ) {
    lines.push(normalizedDescription)
  }

  if (item.item_type === "ACCOMMODATION" || item.item_type === "HOTEL") {
    const badges: string[] = []
    if (item.destination_city) badges.push(item.destination_city)
    if (item.hotel_stars) badges.push(`${"★".repeat(item.hotel_stars)}`)
    if (item.room_type) badges.push(item.room_type)
    if (item.meal_plan) badges.push(QUOTATION_MEAL_PLAN_LABELS[item.meal_plan] || item.meal_plan)
    if (item.rooms) badges.push(`${item.rooms} habitacion${item.rooms > 1 ? "es" : ""}`)
    if (badges.length > 0) lines.push(badges.join(" | "))

    const stayDetails: string[] = []
    if (item.checkin_date && item.checkout_date) {
      stayDetails.push(`${formatQuotationDateShort(item.checkin_date)} -> ${formatQuotationDateShort(item.checkout_date)}`)
    }
    if (item.nights) stayDetails.push(`${item.nights} noche${item.nights > 1 ? "s" : ""}`)
    if (stayDetails.length > 0) lines.push(stayDetails.join(" | "))

    if (item.hotel_address) lines.push(`Direccion: ${item.hotel_address}`)
  }

  if (item.item_type === "FLIGHT") {
    if (item.flight_route) {
      lines.push(`Ruta: ${item.flight_route.replace(/\s*[-→>]+\s*/g, " -> ")}`)
    }

    const flightMeta: string[] = []
    if (item.flight_class) {
      flightMeta.push(QUOTATION_FLIGHT_CLASS_LABELS[item.flight_class] || item.flight_class)
    }
    if (item.flight_stops != null) {
      flightMeta.push(item.flight_stops === 0 ? "Directo" : `${item.flight_stops} escala${item.flight_stops > 1 ? "s" : ""}`)
    }
    if (flightMeta.length > 0) lines.push(flightMeta.join(" | "))

    const flightDates: string[] = []
    if (item.flight_date) flightDates.push(`Ida: ${formatQuotationDateShort(item.flight_date)}`)
    if (item.flight_return_date) flightDates.push(`Vuelta: ${formatQuotationDateShort(item.flight_return_date)}`)
    if (flightDates.length > 0) lines.push(flightDates.join(" | "))
  }

  if (item.item_type === "TRANSFER" && item.transfer_description && item.transfer_description !== title) {
    lines.push(item.transfer_description)
  }

  if (item.price_per_unit != null && item.price_per_unit > 0) {
    lines.push(`Precio por unidad: ${formatQuotationCurrency(item.price_per_unit, currency)}`)
  }

  if (item.provider) {
    lines.push(`Operador: ${item.provider}`)
  }

  if (item.notes) {
    lines.push(`Notas: ${item.notes}`)
  }

  return lines
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen"))
    reader.readAsDataURL(blob)
  })
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("No se pudo cargar la imagen"))
    image.src = src
  })
}

async function loadPdfImageData(url: string) {
  let source = url

  if (!source.startsWith("data:")) {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`No se pudo descargar la imagen (${response.status})`)
    }
    source = await blobToDataUrl(await response.blob())
  }

  const image = await loadImageElement(source)
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  const maxDimension = 1600
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(naturalHeight * scale))

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("No se pudo preparar la imagen para PDF")
  }

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    format: "JPEG" as const,
    width: canvas.width,
    height: canvas.height,
  }
}

export async function generateQuotationPDF(
  data: QuotationPresentationData,
  branding: BrandingData
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  const brandColor = hexToRgb(branding.brand_color || "#f97316")
  const brandSoft = tintColor(brandColor, 0.9)
  const borderSoft = tintColor(brandColor, 0.75)
  const companyName = getBrandingValue(branding, "company_name") || data.agency_name || "Agencia"
  const companyAddress = getBrandingValue(branding, "address", "company_address")
  const companyPhone = getBrandingValue(branding, "phone", "company_phone")
  const companyEmail = getBrandingValue(branding, "email", "company_email")
  const companyWebsite = getBrandingValue(branding, "website", "company_website")
  const companyInstagram = getBrandingValue(branding, "instagram", "company_instagram")
  const companyLegajo = getBrandingValue(branding, "legajo", "company_legajo")
  const companyTaxId = getBrandingValue(branding, "tax_id", "company_tax_id")
  const statusLabel = QUOTATION_STATUS_LABELS[data.status] || data.status
  let y = 14

  const addPageChrome = (repeatHeader = false) => {
    doc.setFillColor(...brandColor)
    doc.rect(0, 0, pageWidth, 5, "F")
    y = 14

    if (repeatHeader) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(...brandColor)
      doc.text(companyName, margin, y)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text(`Cotizacion ${data.quotation_number}`, pageWidth - margin, y, { align: "right" })
      y += 8
    }
  }

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= pageHeight - 24) {
      return
    }

    doc.addPage()
    addPageChrome(true)
  }

  const drawSectionTitle = (title: string) => {
    ensureSpace(10)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(35, 35, 35)
    doc.text(title, margin, y)
    y += 5

    doc.setDrawColor(...brandColor)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5
  }

  const drawInfoBox = (entries: Array<[string, string]>) => {
    const rows = Math.ceil(entries.length / 2)
    const boxHeight = rows * 10 + 6
    const columnWidth = (contentWidth - 8) / 2
    ensureSpace(boxHeight + 4)

    doc.setFillColor(...brandSoft)
    doc.setDrawColor(...borderSoft)
    doc.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, "FD")

    entries.forEach(([label, value], index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      const x = margin + 4 + column * (columnWidth + 4)
      const rowY = y + 5 + row * 10

      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(125, 125, 125)
      doc.text(label, x, rowY)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.setTextColor(40, 40, 40)
      const valueLines = doc.splitTextToSize(value || "-", columnWidth)
      doc.text(valueLines, x, rowY + 4)
    })

    y += boxHeight + 6
  }

  const drawTextBlock = (title: string, text: string, fillColor: [number, number, number], titleColor: [number, number, number]) => {
    const lines = doc.splitTextToSize(text, contentWidth - 8)
    const boxHeight = Math.max(12, lines.length * 4 + 8)
    ensureSpace(boxHeight + 4)

    doc.setFillColor(...fillColor)
    doc.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, "F")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...titleColor)
    doc.text(title, margin + 4, y + 5)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(60, 60, 60)
    doc.text(lines, margin + 4, y + 9)

    y += boxHeight + 6
  }

  const drawServiceItem = async (item: QuotationPresentationItem) => {
    const typeLabel = QUOTATION_ITEM_LABELS[item.item_type] || "Servicio"
    const title = getItemTitle(item)
    const titleLines = doc.splitTextToSize(title, contentWidth - 8)
    const lineGroups = getItemLines(item, data.currency)
      .flatMap(line => doc.splitTextToSize(line, contentWidth - 8))
    let screenshotData: Awaited<ReturnType<typeof loadPdfImageData>> | null = null
    let screenshotWidth = 0
    let screenshotHeight = 0
    const screenshotLabelHeight = item.item_type === "FLIGHT" && item.flight_screenshot_url ? 4 : 0

    if (item.item_type === "FLIGHT" && item.flight_screenshot_url) {
      try {
        screenshotData = await loadPdfImageData(item.flight_screenshot_url)
        const maxWidth = contentWidth - 8
        const maxHeight = 55
        const screenshotScale = Math.min(maxWidth / screenshotData.width, maxHeight / screenshotData.height)
        screenshotWidth = screenshotData.width * screenshotScale
        screenshotHeight = screenshotData.height * screenshotScale
      } catch {
        screenshotData = null
      }
    }

    const blockHeight = 10 + titleLines.length * 4 + lineGroups.length * 3.6 + (screenshotData ? screenshotLabelHeight + screenshotHeight + 3 : 0)

    ensureSpace(blockHeight + 4)

    doc.setFillColor(249, 249, 249)
    doc.setDrawColor(233, 233, 233)
    doc.roundedRect(margin, y, contentWidth, blockHeight, 3, 3, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...brandColor)
    doc.text(typeLabel.toUpperCase(), margin + 4, y + 5)

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(40, 40, 40)
    doc.text(titleLines, margin + 4, y + 10)

    if (lineGroups.length > 0) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(105, 105, 105)
      doc.text(lineGroups, margin + 4, y + 10 + titleLines.length * 4)
    }

    if (screenshotData) {
      const textHeight = titleLines.length * 4 + lineGroups.length * 3.6
      const imageLabelY = y + 11 + textHeight

      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(120, 120, 120)
      doc.text("Itinerario del vuelo", margin + 4, imageLabelY)

      const imageX = margin + (contentWidth - screenshotWidth) / 2
      const imageY = imageLabelY + 2
      doc.addImage(screenshotData.dataUrl, screenshotData.format, imageX, imageY, screenshotWidth, screenshotHeight)
    }

    y += blockHeight + 4
  }

  addPageChrome()

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(...brandColor)
  doc.text(companyName, margin, y)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(35, 35, 35)
  doc.text(`Cotizacion ${data.quotation_number}`, pageWidth - margin, y, { align: "right" })
  y += 6

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text(`Estado: ${statusLabel}`, pageWidth - margin, y, { align: "right" })
  y += 4
  doc.text(`Emitida: ${formatQuotationDateLong(data.created_at.split("T")[0])}`, pageWidth - margin, y, { align: "right" })

  const companyLines = [companyAddress, companyPhone, companyEmail].filter(Boolean)
  if (companyLines.length > 0) {
    let infoY = 20
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(115, 115, 115)
    companyLines.forEach(line => {
      doc.text(line, margin, infoY)
      infoY += 3.5
    })
  }

  y = 40

  drawSectionTitle("Resumen del viaje")
  drawInfoBox([
    ["Destino", data.destination || "-"],
    ["Origen", data.origin || "-"],
    ["Salida", formatQuotationDateLong(data.departure_date)],
    ["Regreso", data.return_date ? formatQuotationDateLong(data.return_date) : "-"],
    ["Pasajeros", getQuotationPassengersText(data)],
  ])

  if (data.notes) {
    drawTextBlock("Notas del asesor", data.notes, [239, 246, 255], [37, 99, 235])
  }

  drawSectionTitle("Opciones")

  for (const option of data.options) {
    const pricing = getQuotationOptionPricing(option, data)
    const optionHeaderHeight = pricing.secondaryAmount != null ? 20 : 15
    ensureSpace(optionHeaderHeight + 6)

    doc.setFillColor(...brandSoft)
    doc.setDrawColor(...borderSoft)
    doc.roundedRect(margin, y, contentWidth, optionHeaderHeight, 3, 3, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(40, 40, 40)
    doc.text(option.title, margin + 4, y + 7)

    if (option.is_selected) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(22, 163, 74)
      doc.text("OPCION SELECCIONADA", margin + 4, y + 12)
    }

    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.setTextColor(...brandColor)
    doc.text(formatQuotationCurrency(pricing.primaryAmount, data.currency), pageWidth - margin - 4, y + 7, { align: "right" })

    if (pricing.secondaryAmount != null && pricing.secondaryLabel) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(115, 115, 115)
      doc.text(
        `${pricing.secondaryLabel}: ${formatQuotationCurrency(pricing.secondaryAmount, data.currency)}`,
        pageWidth - margin - 4,
        y + 12,
        { align: "right" }
      )
    }

    y += optionHeaderHeight + 4

    for (const item of option.items) {
      await drawServiceItem(item)
    }

    y += 2
  }

  if (data.terms_and_conditions) {
    drawSectionTitle("Terminos y condiciones")
    drawTextBlock("Condiciones", data.terms_and_conditions, [250, 250, 250], [120, 120, 120])
  }

  drawSectionTitle("Disponibilidad")
  drawTextBlock("Importante", QUOTATION_AVAILABILITY_NOTE, [255, 250, 245], [120, 120, 120])

  const footerHeight = 18
  ensureSpace(footerHeight)

  const footerY = pageHeight - 18
  doc.setDrawColor(...brandColor)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3)

  const legalParts = [companyLegajo ? `Legajo ${companyLegajo}` : "", companyTaxId ? `CUIT ${companyTaxId}` : ""].filter(Boolean)
  const contactParts = [companyPhone, companyEmail, companyWebsite].filter(Boolean)
  const instagramText = companyInstagram
    ? (companyInstagram.startsWith("@") ? companyInstagram : `@${companyInstagram}`)
    : ""

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(130, 130, 130)
  doc.text(companyName, margin, footerY)
  doc.text(`Asesor: ${data.seller_name}`, margin, footerY + 3.5)
  if (legalParts.length > 0) {
    doc.text(legalParts.join(" | "), margin, footerY + 7)
  }

  if (contactParts.length > 0) {
    doc.text(contactParts.join(" | "), pageWidth - margin, footerY, { align: "right" })
  }
  if (instagramText) {
    doc.text(instagramText, pageWidth - margin, footerY + 3.5, { align: "right" })
  }
  doc.text(`Generada el ${formatQuotationDateLong(data.created_at.split("T")[0])}`, pageWidth - margin, footerY + 7, { align: "right" })

  doc.setFillColor(...brandColor)
  doc.rect(0, pageHeight - 4, pageWidth, 4, "F")

  return doc
}

export function downloadQuotationPDF(
  data: QuotationPresentationData,
  branding: BrandingData
) {
  return generateQuotationPDF(data, branding).then((doc) => {
    doc.save(`${data.quotation_number}.pdf`)
  })
}
