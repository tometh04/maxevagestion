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
  perceptions?: Array<{
    type: string
    label: string
    amount: number
    currency: string
  }>
  payerName?: string | null
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
  const brandColor = hexToRgb(data.brandColor || "#f97316")
  const brandPale = tintColor(brandColor, 0.97)
  const brandBorder = tintColor(brandColor, 0.78)
  const slateSoft: [number, number, number] = [248, 250, 252]
  const slateBorder: [number, number, number] = [226, 232, 240]
  // Antes había emeraldSoft/Border y amberSoft/Border para los tiles de colores.
  // Removidos junto con drawMetricTile (rediseño sobrio 2026-05-16).
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

  // Header sobrio per-tenant: banda fina con brand color, logo + nombre del tenant,
  // contacto en línea fina debajo. Pestaña "RECIBO Nº xxx" a la derecha sin texto
  // duplicado. Antes tenía 24mm + "Recibo de pago" + "Comprobante de pago" + "RECIBO X"
  // (3 etiquetas que decían lo mismo) → ahora 1 sola etiqueta clara.
  const addPageChrome = (_repeatHeader = false) => {
    // Banda fina brand color (antes 24mm + sub-banda → ahora 4mm sólida)
    doc.setFillColor(...brandColor)
    doc.rect(0, 0, pageWidth, 4, "F")

    let textStartX = margin
    const headerTop = 10

    if (logoData) {
      const logoHeight = 14
      const logoWidth = (logoData.width / logoData.height) * logoHeight
      doc.addImage(logoData.dataUrl, logoData.format, margin, headerTop, logoWidth, logoHeight)
      textStartX += logoWidth + 5
    }

    // Nombre del tenant en negro sobrio
    doc.setTextColor(15, 23, 42)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text(companyName, textStartX, headerTop + 6)

    // Contacto en línea fina debajo del nombre (city/branch | phone | email)
    const contactLine = [branchLabel, companyPhone, companyEmail].filter(Boolean).join(" · ")
    if (contactLine) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(107, 114, 128)
      const wrappedLines: string[] = doc.splitTextToSize(
        contactLine,
        pageWidth - textStartX - 55
      ) as string[]
      wrappedLines.slice(0, 2).forEach((line, idx) => {
        doc.text(line, textStartX, headerTop + 11 + idx * 3.5)
      })
    }

    // Pestaña derecha: solo "RECIBO Nº" sin redundancia
    doc.setTextColor(...brandColor)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.text("RECIBO Nº", pageWidth - margin, headerTop + 4, { align: "right" })

    doc.setTextColor(31, 41, 55)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text(data.receiptNumber, pageWidth - margin, headerTop + 10, { align: "right" })

    doc.setTextColor(107, 114, 128)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.text(
      `Emitido el ${data.fechaFormateada}`,
      pageWidth - margin,
      headerTop + 14.5,
      { align: "right" }
    )

    // Línea divisoria fina
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.3)
    doc.line(margin, 32, pageWidth - margin, 32)

    y = 38
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
    let height = 16 // padding título + top
    const DIVIDER_SPACING = 4.5 // mantener en sync con drawInfoCard

    items.forEach((item, index) => {
      const valueLines = doc.splitTextToSize(item.value, innerWidth)
      const noteLines = item.note ? doc.splitTextToSize(item.note, innerWidth) : []
      // Label uppercase + lines del value + lines del note
      height += 3.7 + valueLines.length * 3.7 + noteLines.length * 3.2
      // Bug fix 2026-05-19 (Maxi): el cálculo viejo NO sumaba el espacio del
      // divisor entre items. Con 5 items eran 4 divisores × 4.5 ≈ 18px
      // sin contar. Resultado: la siguiente sección ("Resumen financiero")
      // se montaba arriba del último item ("3 adultos").
      if (index < items.length - 1) {
        height += DIVIDER_SPACING
      }
    })

    return Math.max(height + 4, 26)
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

  // Resumen financiero: antes 4 tiles saturados (naranja sólido + emerald + slate + amber).
  // Ahora: 1 card limpia con 4 filas — el monto cobrado destacado arriba, el resto en
  // tipografía menor con divisores finos. Saldo pendiente con leve fondo brand solo si > 0.
  const drawSummaryCard = () => {
    const sameCurrency = data.currency === receiptCurrency
    const cardHeight = 56
    ensureSpace(cardHeight + 4)

    // Card contenedora
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.4)
    doc.roundedRect(margin, y, contentWidth, cardHeight, 4, 4, "FD")

    const padX = 6

    // Fila 1 — Cobrado en este recibo (destacado, brand color)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(...brandColor)
    doc.text("COBRADO EN ESTE RECIBO", margin + padX, y + 8)

    doc.setFont("helvetica", "bold")
    doc.setFontSize(18)
    doc.setTextColor(15, 23, 42)
    doc.text(formatCurrencyValue(receiptCurrency, receivedNow), margin + padX, y + 17)

    // Subtitle del cobro: si la moneda difiere, mostrar lo recibido en su moneda original
    if (!sameCurrency) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(107, 114, 128)
      doc.text(
        `Recibido: ${formatCurrencyValue(data.currency, data.amount)}`,
        pageWidth - margin - padX,
        y + 17,
        { align: "right" }
      )
    }

    // Divisor
    doc.setDrawColor(241, 245, 249)
    doc.setLineWidth(0.3)
    doc.line(margin + padX, y + 23, pageWidth - margin - padX, y + 23)

    // Fila 2 — Total cobrado | Total paquete | Saldo (3 columnas finas)
    const colWidth = (contentWidth - padX * 2) / 3
    const colTop = y + 30
    const drawMiniMetric = (
      colIndex: number,
      label: string,
      value: string,
      highlight: boolean
    ) => {
      const colX = margin + padX + colIndex * colWidth
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6.8)
      doc.setTextColor(107, 114, 128)
      doc.text(label.toUpperCase(), colX, colTop)

      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.setTextColor(...(highlight ? brandColor : [15, 23, 42] as [number, number, number]))
      doc.text(value, colX, colTop + 6)
    }

    drawMiniMetric(0, "Total cobrado", formatCurrencyValue(receiptCurrency, data.totalPagado), false)
    drawMiniMetric(1, totalContextLabel, formatCurrencyValue(receiptCurrency, data.totalOperacion), false)
    drawMiniMetric(
      2,
      data.saldoRestante > 0 ? "Saldo pendiente" : "Saldo",
      data.saldoRestante > 0
        ? formatCurrencyValue(receiptCurrency, data.saldoRestante)
        : "Pago completo",
      data.saldoRestante > 0
    )

    // Banda fina con divisores entre columnas
    doc.setDrawColor(241, 245, 249)
    doc.setLineWidth(0.3)
    for (let i = 1; i < 3; i++) {
      const lineX = margin + padX + i * colWidth - 2
      doc.line(lineX, colTop - 3, lineX, colTop + 9)
    }

    y += cardHeight + 6
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

  // Sección Cliente: solo dibujar heading+card si efectivamente hay algo que mostrar.
  // Antes se dibujaba el heading siempre y el drawInfoCard internamente filtraba items
  // vacíos → si address/city eran "-", quedaba el header "Datos del cliente" colgando
  // sin card debajo (bug visual reportado).
  const customerName = (data.customerName || "").trim()
  const customerLastName = (data.customerLastName || "").trim()
  const customerFullName =
    customerLastName && !customerName.toLocaleLowerCase().endsWith(customerLastName.toLocaleLowerCase())
      ? `${customerName} ${customerLastName}`.trim()
      : customerName
  const payerName = (data.payerName || "").trim()
  const customerItems: InfoItem[] = [
    { label: "Pasajeros", value: normalizeText(data.passengerNamesText, "") },
    ...(payerName ? [{ label: "Abonado por", value: payerName }] : []),
    { label: "Domicilio", value: normalizeText(data.customerAddress, "") },
    { label: "Localidad", value: normalizeText(data.customerCity, "") },
  ].filter((item) => item.value && item.value !== "-")

  if (customerItems.length > 0 || customerFullName) {
    drawSectionHeading("Cliente")
    drawInfoCard(
      normalizeText(customerFullName || data.customerName),
      customerItems,
      {
        fillColor: slateSoft,
        borderColor: slateBorder,
        titleColor: brandColor,
      }
    )
  }

  // Pasajeros ya va en la sección "Cliente"; acá solo datos de la operación.
  if (data.receiptScope === "SERVICE") {
    contextItems.push(
      { label: "Servicio", value: normalizeText(data.serviceLabel) },
      { label: "Detalle", value: normalizeText(data.serviceDescription, "") },
      { label: "Operación", value: normalizeText(data.fileCode, "") },
      { label: "Destino", value: normalizeText(data.destination, "") },
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
      { label: "Composición", value: buildPassengersText(data) }
    )
  }

  drawSectionHeading(
    data.receiptScope === "SERVICE" ? "Servicio y operación" : "Operación"
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

  drawSectionHeading("Resumen financiero", `Totales en ${receiptCurrency}`)
  drawSummaryCard()

  if (paymentHistory.length > 0) {
    drawHistoryTable()
  }

  // Percepciones impositivas aplicadas a este cobro
  const perceptions = data.perceptions || []
  if (perceptions.length > 0) {
    drawSectionHeading("Percepciones impositivas cobradas")
    const percItems: InfoItem[] = perceptions.map((p) => ({
      label: p.label,
      value: formatCurrencyValue(p.currency, p.amount),
      note: "La agencia actúa como agente de percepción — este importe es recaudado por la agencia en nombre de AFIP.",
    }))
    drawInfoCard("Percepciones incluidas en este cobro", percItems, {
      fillColor: slateSoft,
      borderColor: slateBorder,
      titleColor: brandColor,
    })
  }

  // drawFooterNote() removida — la info de saldo pendiente ya está en el summary card.
  // El footer del pie (página X de Y, dirección/CUIT) sigue en addFooters().

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
