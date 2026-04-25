import { format } from "date-fns"
import { es } from "date-fns/locale"

export interface ReceiptPdfData {
  currentPaymentId?: string
  receiptNumber: string
  receiptScope?: "OPERATION" | "SERVICE"
  fechaFormateada: string
  agencyCity: string
  agencyName: string
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyLegajo?: string
  companyTaxId?: string
  brandColor?: string
  brandLogo?: string
  /** Texto libre de Términos y Condiciones (configurable por tenant en Settings). Render al pie. */
  pdfTermsText?: string
  customerName: string
  customerLastName?: string
  passengerNamesText: string
  receiptFileName?: string
  customerAddress: string
  customerCity: string
  currencyName: string
  currency: string
  receiptCurrency?: string
  amount: number
  amountInReceiptCurrency?: number
  concepto: string
  totalOperacion: number
  totalPagado: number
  saldoRestante: number
  destination?: string
  fileCode?: string
  origin?: string
  departureDate?: string | null
  returnDate?: string | null
  adults?: number
  children?: number
  infants?: number
  operationType?: string
  operatorName?: string
  serviceType?: string
  serviceLabel?: string
  serviceDescription?: string
  serviceOperatorName?: string
  paymentHistory?: Array<{
    id: string
    amount: number
    currency: string
    datePaid: string | null
    reference: string
    amountInReceiptCurrency?: number
  }>
}

interface InfoItem {
  label: string
  value: string
  note?: string
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatCurrencyValue(currency: string, amount: number): string {
  return `${currency} ${formatMoney(amount)}`
}

function normalizeText(value?: string | null, fallback = "-"): string {
  const normalized = value?.trim()
  return normalized ? normalized : fallback
}

function parseDateValue(value: string): Date {
  return new Date(value.includes("T") ? value : `${value}T12:00:00`)
}

function formatDateLong(value?: string | null): string {
  if (!value) return "-"

  try {
    return format(parseDateValue(value), "d 'de' MMMM 'de' yyyy", { locale: es })
  } catch {
    return "-"
  }
}

function formatDateShort(value?: string | null): string {
  if (!value) return "-"

  try {
    return format(parseDateValue(value), "dd/MM/yyyy", { locale: es })
  } catch {
    return "-"
  }
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
  const maxDimension = 1400
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
    dataUrl: canvas.toDataURL("image/png", 0.95),
    format: "PNG" as const,
    width: canvas.width,
    height: canvas.height,
  }
}

function buildPassengersText(data: ReceiptPdfData): string {
  const passengers: string[] = []

  if ((data.adults || 0) > 0) {
    passengers.push(`${data.adults} adulto${data.adults === 1 ? "" : "s"}`)
  }
  if ((data.children || 0) > 0) {
    passengers.push(`${data.children} menor${data.children === 1 ? "" : "es"}`)
  }
  if ((data.infants || 0) > 0) {
    passengers.push(`${data.infants} bebé${data.infants === 1 ? "" : "s"}`)
  }

  return passengers.length > 0 ? passengers.join(", ") : "-"
}

export async function fetchReceiptData(paymentId: string): Promise<ReceiptPdfData> {
  const response = await fetch(`/api/receipt-data?paymentId=${paymentId}`)

  if (!response.ok) {
    let errorMessage = "Error al obtener datos del recibo"

    try {
      const errorData = await response.json()
      if (errorData?.error) {
        errorMessage = errorData.error
      }
    } catch {
      // no-op
    }

    throw new Error(errorMessage)
  }

  return response.json()
}

export async function downloadReceiptPdf(paymentId: string): Promise<void> {
  const data = await fetchReceiptData(paymentId)
  await generateReceiptPdf(data)
}

export async function generateReceiptPdf(data: ReceiptPdfData): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  const footerReserve = 22
  const headerHeight = 33
  const receiptCurrency = data.receiptCurrency || data.currency
  const receivedNow = data.amountInReceiptCurrency ?? data.amount
  const companyName = normalizeText(data.companyName || data.agencyName, "Mi Empresa")
  const branchLabel =
    data.agencyName && data.agencyName !== companyName
      ? [data.agencyName, data.agencyCity].filter(Boolean).join(" | ")
      : data.agencyCity || data.agencyName || ""
  const companyAddress = normalizeText(data.companyAddress, "")
  const companyPhone = normalizeText(data.companyPhone, "")
  const companyEmail = normalizeText(data.companyEmail, "")
  const companyLegajo = normalizeText(data.companyLegajo, "")
  const companyTaxId = normalizeText(data.companyTaxId, "")
  const totalContextLabel = data.receiptScope === "SERVICE" ? "Total del servicio" : "Total del paquete"
  const historyContextLabel = data.receiptScope === "SERVICE" ? "servicio" : "paquete"
  const brandColor = hexToRgb(data.brandColor || "#f97316")
  const brandSoft = tintColor(brandColor, 0.92)
  const brandPale = tintColor(brandColor, 0.97)
  const brandBorder = tintColor(brandColor, 0.78)
  const slateSoft: [number, number, number] = [248, 250, 252]
  const slateBorder: [number, number, number] = [226, 232, 240]
  const emeraldSoft: [number, number, number] = [236, 253, 245]
  const emeraldBorder: [number, number, number] = [167, 243, 208]
  const amberSoft: [number, number, number] = [255, 247, 237]
  const amberBorder: [number, number, number] = [253, 230, 138]
  const paymentHistory = data.paymentHistory || []
  const contextItems: InfoItem[] = []
  let y = 0
  let logoData:
    | {
        dataUrl: string
        format: "PNG"
        width: number
        height: number
      }
    | null = null

  // Logo del tenant. Antes había un fallback a "/lozada-logo.png" hardcoded
  // que aparecía en recibos de TODAS las agencias si no tenían su propio logo.
  // En SaaS multi-tenant eso es un leak de marca → eliminado.
  if (data.brandLogo) {
    try {
      logoData = await loadPdfImageData(data.brandLogo)
    } catch {
      // Si falla la carga del logo del tenant, el recibo se renderiza solo con texto.
    }
  }

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= pageHeight - footerReserve) {
      return
    }

    doc.addPage()
    addPageChrome(true)
  }

  const addPageChrome = (repeatHeader = false) => {
    doc.setFillColor(...brandColor)
    doc.rect(0, 0, pageWidth, 24, "F")

    doc.setFillColor(...brandSoft)
    doc.rect(0, 24, pageWidth, 4, "F")

    let textStartX = margin
    if (logoData) {
      const logoHeight = 12
      const logoWidth = (logoData.width / logoData.height) * logoHeight
      doc.addImage(logoData.dataUrl, logoData.format, margin, 6, logoWidth, logoHeight)
      textStartX += logoWidth + 4
    }

    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    doc.text(companyName, textStartX, 11)

    const headerLines: string[] = doc.splitTextToSize(
      [branchLabel, companyPhone, companyEmail].filter(Boolean).join(" | "),
      pageWidth - textStartX - 62
    ) as string[]

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    headerLines.slice(0, 2).forEach((line, index) => {
      doc.text(line, textStartX, 16 + index * 3.7)
    })

    doc.setFillColor(255, 255, 255)
    doc.roundedRect(pageWidth - 58, 5.5, 42, 16.5, 3, 3, "F")

    doc.setTextColor(...brandColor)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.text("Recibo de pago", pageWidth - 54, 12)

    doc.setTextColor(75, 85, 99)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.7)
    doc.text(`RECIBO X · ${data.receiptNumber}`, pageWidth - 54, 16)
    doc.text("Comprobante de pago", pageWidth - 54, 19.5)

    y = repeatHeader ? headerHeight : 37
  }

  const drawSectionHeading = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 11 : 8)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(31, 41, 55)
    doc.text(title, margin, y)

    if (subtitle) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(107, 114, 128)
      doc.text(subtitle, pageWidth - margin, y, { align: "right" })
    }

    y += 3
    doc.setDrawColor(...brandBorder)
    doc.setLineWidth(0.4)
    doc.line(margin, y, pageWidth - margin, y)
    y += 6
  }

  const measureInfoCardHeight = (items: InfoItem[]) => {
    const innerWidth = contentWidth - 10
    let height = 16

    items.forEach((item) => {
      const valueLines = doc.splitTextToSize(item.value, innerWidth)
      const noteLines = item.note ? doc.splitTextToSize(item.note, innerWidth) : []
      height += 4 + valueLines.length * 3.7 + noteLines.length * 3.2
    })

    return Math.max(height + 2, 26)
  }

  const drawInfoCard = (
    title: string,
    items: InfoItem[],
    options?: {
      fillColor?: [number, number, number]
      borderColor?: [number, number, number]
      titleColor?: [number, number, number]
    }
  ) => {
    const filteredItems = items.filter((item) => item.value && item.value !== "-")
    if (filteredItems.length === 0) {
      return
    }

    const cardHeight = measureInfoCardHeight(filteredItems)
    const fillColor = options?.fillColor || slateSoft
    const borderColor = options?.borderColor || slateBorder
    const titleColor = options?.titleColor || brandColor
    const innerWidth = contentWidth - 10

    ensureSpace(cardHeight + 4)

    doc.setFillColor(...fillColor)
    doc.setDrawColor(...borderColor)
    doc.roundedRect(margin, y, contentWidth, cardHeight, 4, 4, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...titleColor)
    doc.text(title, margin + 5, y + 7)

    let cursorY = y + 13

    filteredItems.forEach((item, index) => {
      const valueLines = doc.splitTextToSize(item.value, innerWidth)
      const noteLines = item.note ? doc.splitTextToSize(item.note, innerWidth) : []

      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.1)
      doc.setTextColor(100, 116, 139)
      doc.text(item.label.toUpperCase(), margin + 5, cursorY)
      cursorY += 3.7

      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.setTextColor(31, 41, 55)
      doc.text(valueLines, margin + 5, cursorY)
      cursorY += valueLines.length * 3.7

      if (noteLines.length > 0) {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7.3)
        doc.setTextColor(100, 116, 139)
        doc.text(noteLines, margin + 5, cursorY)
        cursorY += noteLines.length * 3.2
      }

      if (index < filteredItems.length - 1) {
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.2)
        doc.line(margin + 5, cursorY + 1.2, pageWidth - margin - 5, cursorY + 1.2)
        cursorY += 4.5
      }
    })

    y += cardHeight + 5
  }

  const drawMetricTile = (
    x: number,
    top: number,
    width: number,
    height: number,
    title: string,
    value: string,
    subtitle: string,
    options?: {
      fillColor?: [number, number, number]
      borderColor?: [number, number, number]
      titleColor?: [number, number, number]
      valueColor?: [number, number, number]
      subtitleColor?: [number, number, number]
    }
  ) => {
    doc.setFillColor(...(options?.fillColor || slateSoft))
    doc.setDrawColor(...(options?.borderColor || slateBorder))
    doc.roundedRect(x, top, width, height, 4, 4, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...(options?.titleColor || [100, 116, 139]))
    doc.text(title.toUpperCase(), x + 4, top + 6)

    doc.setFont("helvetica", "bold")
    doc.setFontSize(12.5)
    doc.setTextColor(...(options?.valueColor || [15, 23, 42]))
    doc.text(value, x + 4, top + 13)

    const subtitleLines = doc.splitTextToSize(subtitle, width - 8)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...(options?.subtitleColor || [100, 116, 139]))
    doc.text(subtitleLines.slice(0, 2), x + 4, top + 18)
  }

  const drawSummaryGrid = () => {
    ensureSpace(56)

    const tileGap = 4
    const tileWidth = (contentWidth - tileGap) / 2
    const tileHeight = 23
    const summaryTop = y
    const sameCurrency = data.currency === receiptCurrency

    drawMetricTile(
      margin,
      summaryTop,
      tileWidth,
      tileHeight,
      "Cobrado en este recibo",
      formatCurrencyValue(receiptCurrency, receivedNow),
      sameCurrency
        ? `Moneda recibida: ${data.currencyName}`
        : `Recibido: ${formatCurrencyValue(data.currency, data.amount)}`,
      {
        fillColor: brandColor,
        borderColor: brandColor,
        titleColor: [255, 255, 255],
        valueColor: [255, 255, 255],
        subtitleColor: [255, 245, 230],
      }
    )

    drawMetricTile(
      margin + tileWidth + tileGap,
      summaryTop,
      tileWidth,
      tileHeight,
      "Total cobrado",
      formatCurrencyValue(receiptCurrency, data.totalPagado),
      `Suma histórica cobrada del ${historyContextLabel}`,
      {
        fillColor: emeraldSoft,
        borderColor: emeraldBorder,
        titleColor: [22, 101, 52],
        valueColor: [22, 101, 52],
        subtitleColor: [22, 101, 52],
      }
    )

    drawMetricTile(
      margin,
      summaryTop + tileHeight + tileGap,
      tileWidth,
      tileHeight,
      totalContextLabel,
      formatCurrencyValue(receiptCurrency, data.totalOperacion),
      `Monto contratado tomado para el recibo`,
      {
        fillColor: slateSoft,
        borderColor: slateBorder,
        titleColor: [71, 85, 105],
        valueColor: [15, 23, 42],
        subtitleColor: [100, 116, 139],
      }
    )

    drawMetricTile(
      margin + tileWidth + tileGap,
      summaryTop + tileHeight + tileGap,
      tileWidth,
      tileHeight,
      "Saldo pendiente",
      formatCurrencyValue(receiptCurrency, data.saldoRestante),
      data.saldoRestante > 0 ? "Resto por abonar" : "Sin saldo pendiente",
      {
        fillColor: data.saldoRestante > 0 ? amberSoft : emeraldSoft,
        borderColor: data.saldoRestante > 0 ? amberBorder : emeraldBorder,
        titleColor: data.saldoRestante > 0 ? [146, 64, 14] : [22, 101, 52],
        valueColor: data.saldoRestante > 0 ? [146, 64, 14] : [22, 101, 52],
        subtitleColor: data.saldoRestante > 0 ? [146, 64, 14] : [22, 101, 52],
      }
    )

    y += tileHeight * 2 + tileGap + 6
  }

  const drawHistoryTableHeader = (top: number) => {
    const dateWidth = 23
    const detailWidth = 71
    const receivedWidth = 34
    const appliedWidth = contentWidth - dateWidth - detailWidth - receivedWidth

    doc.setFillColor(...brandPale)
    doc.setDrawColor(...brandBorder)
    doc.roundedRect(margin, top, contentWidth, 10, 3, 3, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.3)
    doc.setTextColor(...brandColor)
    doc.text("FECHA", margin + 3, top + 6)
    doc.text("DETALLE", margin + dateWidth + 3, top + 6)
    doc.text("COBRADO", margin + dateWidth + detailWidth + 3, top + 6)
    doc.text("APLICADO AL SALDO", margin + dateWidth + detailWidth + receivedWidth + 3, top + 6)

    return { dateWidth, detailWidth, receivedWidth, appliedWidth }
  }

  const drawHistoryTable = () => {
    const subtitle =
      paymentHistory.length > 1
        ? "Incluye el acumulado cobrado y el pago emitido en este recibo"
        : "Muestra el cobro actual y su impacto sobre el saldo"

    drawSectionHeading("Historial de pagos", subtitle)

    let columnSizes = drawHistoryTableHeader(y)
    y += 12

    if (paymentHistory.length === 0) {
      drawInfoCard("Sin pagos registrados", [
        {
          label: "Histórico",
          value: "No se encontraron cobros previos para este recibo.",
        },
      ])
      return
    }

    paymentHistory.forEach((payment) => {
      const detailText = payment.reference?.trim() || "Pago registrado"
      const badgeText = payment.id === data.currentPaymentId ? "Este recibo" : ""
      const detailValue = badgeText ? `${detailText} • ${badgeText}` : detailText
      const detailLines = doc.splitTextToSize(detailValue, columnSizes.detailWidth - 6)
      const receivedLines = doc.splitTextToSize(
        formatCurrencyValue(payment.currency, payment.amount),
        columnSizes.receivedWidth - 6
      )
      const appliedLines = doc.splitTextToSize(
        formatCurrencyValue(receiptCurrency, payment.amountInReceiptCurrency || 0),
        columnSizes.appliedWidth - 6
      )
      const maxLines = Math.max(detailLines.length, receivedLines.length, appliedLines.length, 1)
      const rowHeight = Math.max(10, 5 + maxLines * 3.8)

      if (y + rowHeight + 2 > pageHeight - footerReserve) {
        doc.addPage()
        addPageChrome(true)
        drawSectionHeading("Historial de pagos", subtitle)
        columnSizes = drawHistoryTableHeader(y)
        y += 12
      }

      if (payment.id === data.currentPaymentId) {
        doc.setFillColor(...brandPale)
        doc.roundedRect(margin, y - 0.5, contentWidth, rowHeight, 3, 3, "F")
        doc.setFillColor(...brandColor)
        doc.roundedRect(margin, y - 0.5, 2.5, rowHeight, 2, 2, "F")
      }

      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.25)
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.2)
      doc.setTextColor(31, 41, 55)
      doc.text(formatDateShort(payment.datePaid), margin + 3, y + 5)

      doc.setFont("helvetica", payment.id === data.currentPaymentId ? "bold" : "normal")
      doc.text(detailLines, margin + columnSizes.dateWidth + 3, y + 5)

      doc.setFont("helvetica", "normal")
      doc.text(
        receivedLines,
        margin + columnSizes.dateWidth + columnSizes.detailWidth + 3,
        y + 5
      )
      doc.text(
        appliedLines,
        margin + columnSizes.dateWidth + columnSizes.detailWidth + columnSizes.receivedWidth + 3,
        y + 5
      )

      y += rowHeight + 2
    })
  }

  const drawFooterNote = () => {
    ensureSpace(18)

    const fillColor = data.saldoRestante > 0 ? amberSoft : emeraldSoft
    const borderColor = data.saldoRestante > 0 ? amberBorder : emeraldBorder
    const textColor: [number, number, number] = data.saldoRestante > 0 ? [146, 64, 14] : [22, 101, 52]
    const noteTitle = data.saldoRestante > 0 ? "Saldo pendiente" : "Pago completo"
    const noteBody =
      data.saldoRestante > 0
        ? `Luego de este recibo quedan ${formatCurrencyValue(receiptCurrency, data.saldoRestante)} pendientes. Total cobrado al momento: ${formatCurrencyValue(receiptCurrency, data.totalPagado)}.`
        : `Con este recibo el ${historyContextLabel} queda pago en su totalidad. Total cobrado acumulado: ${formatCurrencyValue(receiptCurrency, data.totalPagado)}.`
    const noteLines = doc.splitTextToSize(noteBody, contentWidth - 10)
    const cardHeight = 12 + noteLines.length * 3.7

    doc.setFillColor(...fillColor)
    doc.setDrawColor(...borderColor)
    doc.roundedRect(margin, y, contentWidth, cardHeight, 4, 4, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...textColor)
    doc.text(noteTitle, margin + 5, y + 7)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.2)
    doc.text(noteLines, margin + 5, y + 12)

    y += cardHeight + 4
  }

  const addFooters = () => {
    const totalPages = doc.getNumberOfPages()
    const footerLeft = [companyAddress, companyLegajo ? `Legajo ${companyLegajo}` : "", companyTaxId ? `CUIT ${companyTaxId}` : ""]
      .filter(Boolean)
      .join(" | ")

    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page)
      const footerY = pageHeight - 11

      doc.setDrawColor(...brandBorder)
      doc.setLineWidth(0.3)
      doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.setTextColor(107, 114, 128)

      if (footerLeft) {
        doc.text(footerLeft, margin, footerY)
      }

      doc.text(
        "Este recibo es válido como comprobante de pago. No válido como factura.",
        pageWidth / 2,
        footerY + 3.2,
        { align: "center" }
      )

      doc.text(`Página ${page} de ${totalPages}`, pageWidth - margin, footerY, { align: "right" })
    }
  }

  addPageChrome()

  drawSectionHeading(
    "Datos del cliente",
    `Emitido en ${[data.agencyCity, data.fechaFormateada].filter(Boolean).join(", ")}`
  )
  // Nombre completo: concatenar customerName (first_name) + customerLastName (last_name)
  // que vienen separados desde la API. Antes solo se renderizaba customerName y faltaba el apellido.
  const customerFullName = [data.customerName, data.customerLastName]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ")
  drawInfoCard(
    normalizeText(customerFullName || data.customerName),
    [
      { label: "Domicilio", value: normalizeText(data.customerAddress) },
      { label: "Localidad", value: normalizeText(data.customerCity) },
    ],
    {
      fillColor: slateSoft,
      borderColor: slateBorder,
      titleColor: brandColor,
    }
  )

  if (data.receiptScope === "SERVICE") {
    contextItems.push(
      { label: "Servicio", value: normalizeText(data.serviceLabel) },
      { label: "Detalle", value: normalizeText(data.serviceDescription, "") },
      { label: "Operación", value: normalizeText(data.fileCode, "") },
      { label: "Destino", value: normalizeText(data.destination, "") },
      { label: "Pasajeros", value: normalizeText(data.passengerNamesText) },
      { label: "Composición", value: buildPassengersText(data) },
      {
        label: "Fechas",
        value: [formatDateLong(data.departureDate), formatDateLong(data.returnDate)]
          .filter((entry) => entry !== "-")
          .join(" · "),
      }
    )
  } else {
    contextItems.push(
      { label: "Código de operación", value: normalizeText(data.fileCode, "") },
      { label: "Destino", value: normalizeText(data.destination, "") },
      { label: "Origen", value: normalizeText(data.origin, "") },
      {
        label: "Fechas",
        value: [formatDateLong(data.departureDate), formatDateLong(data.returnDate)]
          .filter((entry) => entry !== "-")
          .join(" · "),
      },
      { label: "Pasajeros", value: normalizeText(data.passengerNamesText) },
      { label: "Composición", value: buildPassengersText(data) }
    )
  }

  drawSectionHeading(
    data.receiptScope === "SERVICE" ? "Servicio y operación" : "Detalle de la operación"
  )
  drawInfoCard(
    data.receiptScope === "SERVICE" ? "Servicio asociado" : "Operación asociada",
    contextItems,
    {
      fillColor: slateSoft,
      borderColor: slateBorder,
      titleColor: brandColor,
    }
  )

  drawSectionHeading("Resumen financiero", `Totales expresados en ${receiptCurrency}`)
  drawSummaryGrid()

  drawHistoryTable()
  drawFooterNote()

  // Términos y condiciones configurables por tenant (Settings → Interface → Términos en PDFs).
  // Se renderizan en un bloque gris al pie antes del footer. Si el tenant no configuró texto,
  // no se agrega el bloque.
  const termsText = (data.pdfTermsText || "").trim()
  if (termsText) {
    const termsLines = doc.splitTextToSize(termsText, contentWidth - 10)
    const cardHeight = 10 + termsLines.length * 3.5
    ensureSpace(cardHeight + 4)
    y += 4

    doc.setFillColor(244, 246, 248)
    doc.setDrawColor(225, 228, 232)
    doc.roundedRect(margin, y, contentWidth, cardHeight, 4, 4, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(75, 85, 99)
    doc.text("Términos y Condiciones", margin + 5, y + 6)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(75, 85, 99)
    doc.text(termsLines, margin + 5, y + 10)

    y += cardHeight + 4
  }

  addFooters()
  doc.save(data.receiptFileName || `recibo-${data.receiptNumber}.pdf`)
}
