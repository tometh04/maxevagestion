import { format } from "date-fns"
import { es } from "date-fns/locale"

export interface ReceiptPdfData {
  receiptNumber: string
  receiptScope?: "OPERATION" | "SERVICE"
  fechaFormateada: string
  agencyCity: string
  agencyName: string
  customerName: string
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

function formatMoney(amount: number): string {
  return amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const receiptCurrency = data.receiptCurrency || data.currency
  const totalContextLabel = data.receiptScope === "SERVICE" ? "Total servicio" : "Total operación"
  let y = 0

  doc.setFillColor(194, 156, 95)
  doc.rect(0, 0, pageWidth * 0.55, 35, "F")

  doc.setFillColor(255, 255, 255)
  doc.triangle(pageWidth * 0.45, 0, pageWidth * 0.55, 17.5, pageWidth * 0.45, 35, "F")

  doc.setFillColor(184, 142, 74)
  doc.rect(pageWidth * 0.55, 0, pageWidth * 0.45, 35, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont("helvetica", "bold")
  doc.text("LOZADA", 15, 18)
  doc.setFontSize(16)
  doc.setFont("helvetica", "italic")
  doc.text("Viajes", 62, 22)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.3)
  doc.rect(pageWidth - 45, 3, 40, 12)
  doc.setFontSize(6)
  doc.text("Documento no", pageWidth - 43, 7)
  doc.text("valido como", pageWidth - 43, 10)
  doc.text("factura", pageWidth - 43, 13)
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("X", pageWidth - 12, 12)

  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text("N° Legajo: 18181", pageWidth - 45, 20)
  doc.text("+5493412753942", pageWidth - 45, 24)
  doc.text("rosario.ventas@lozadaviajes.com", pageWidth - 45, 28)
  doc.text("Corrientes 631 (Piso 1) Rosario, Santa Fe", pageWidth - 45, 32)

  y = 45

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`${data.agencyCity} ${data.fechaFormateada}`, margin, y)

  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text(`RECIBO X: No ${data.receiptNumber}`, pageWidth - margin, y, { align: "right" })

  y += 15

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)

  y += 12

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Señor/a:", margin, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.customerName, margin + 25, y)

  y += 8

  doc.setFont("helvetica", "bold")
  doc.text("Domicilio:", margin, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.customerAddress || "-", margin + 28, y)

  y += 8

  doc.setFont("helvetica", "bold")
  doc.text("Localidad:", margin, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.customerCity || "-", margin + 28, y)

  y += 15

  if (data.destination || data.fileCode) {
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 5, pageWidth - 2 * margin, 10, "F")
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(194, 156, 95)
    doc.text("INFORMACIÓN DEL VIAJE", margin + 5, y + 2)
    doc.setTextColor(0, 0, 0)
    y += 15

    doc.setFontSize(9)
    if (data.fileCode) {
      doc.setFont("helvetica", "bold")
      doc.text("Código de Operación:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.fileCode, margin + 50, y)
      y += 7
    }
    if (data.destination) {
      doc.setFont("helvetica", "bold")
      doc.text("Destino:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.destination, margin + 25, y)
      y += 7
    }
    if (data.origin) {
      doc.setFont("helvetica", "bold")
      doc.text("Origen:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.origin, margin + 25, y)
      y += 7
    }
    if (data.departureDate) {
      doc.setFont("helvetica", "bold")
      doc.text("Fecha de Salida:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(
        format(new Date(data.departureDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es }),
        margin + 40,
        y
      )
      y += 7
    }
    if (data.returnDate) {
      doc.setFont("helvetica", "bold")
      doc.text("Fecha de Regreso:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(
        format(new Date(data.returnDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es }),
        margin + 45,
        y
      )
      y += 7
    }
    if (data.adults || data.children || data.infants) {
      const pasajeros = []
      if ((data.adults || 0) > 0) pasajeros.push(`${data.adults} adulto${data.adults === 1 ? "" : "s"}`)
      if ((data.children || 0) > 0) pasajeros.push(`${data.children} menor${data.children === 1 ? "" : "es"}`)
      if ((data.infants || 0) > 0) pasajeros.push(`${data.infants} bebé${data.infants === 1 ? "" : "s"}`)

      doc.setFont("helvetica", "bold")
      doc.text("Pasajeros:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(pasajeros.join(", ") || "-", margin + 30, y)
      y += 7
    }
    if (data.operatorName) {
      doc.setFont("helvetica", "bold")
      doc.text("Operador:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.operatorName, margin + 28, y)
      y += 7
    }

    y += 10
  }

  if (data.receiptScope === "SERVICE" && (data.serviceLabel || data.serviceDescription || data.serviceOperatorName)) {
    doc.setFillColor(245, 245, 245)
    doc.rect(margin, y - 5, pageWidth - 2 * margin, 10, "F")
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(194, 156, 95)
    doc.text("SERVICIO COBRADO", margin + 5, y + 2)
    doc.setTextColor(0, 0, 0)
    y += 15

    doc.setFontSize(9)
    if (data.serviceLabel) {
      doc.setFont("helvetica", "bold")
      doc.text("Servicio:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.serviceLabel, margin + 25, y)
      y += 7
    }
    if (data.serviceDescription) {
      doc.setFont("helvetica", "bold")
      doc.text("Detalle:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.serviceDescription, margin + 22, y)
      y += 7
    }
    if (data.serviceOperatorName) {
      doc.setFont("helvetica", "bold")
      doc.text("Proveedor:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.serviceOperatorName, margin + 28, y)
      y += 7
    }

    y += 10
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text(`Recibimos la suma de ${data.currency}: ${formatMoney(data.amount)}`, margin, y)

  y += 8

  if (data.currency !== receiptCurrency) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(
      `Equivalente aplicado al saldo: ${receiptCurrency} ${formatMoney(data.amountInReceiptCurrency || 0)}`,
      margin,
      y
    )
    y += 8
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(data.concepto, margin, y)

  y += 10

  doc.setFont("helvetica", "bold")
  doc.text("Moneda recibida:", margin, y)
  doc.setFont("helvetica", "normal")
  doc.text(data.currencyName, margin + 42, y)

  y += 20

  if (data.paymentHistory && data.paymentHistory.length > 1) {
    doc.setFillColor(250, 250, 250)
    doc.rect(margin, y - 5, pageWidth - 2 * margin, 12, "F")
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("HISTORIAL DE PAGOS", margin + 5, y + 2)
    y += 15

    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.text("Fecha", margin, y)
    doc.text("Monto", margin + 50, y)
    doc.text("Referencia", margin + 100, y)
    y += 6

    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4

    doc.setFont("helvetica", "normal")
    for (const payment of data.paymentHistory) {
      const paymentDate = payment.datePaid
        ? format(new Date(payment.datePaid), "dd/MM/yyyy", { locale: es })
        : "-"
      const paymentAmount = `${payment.currency} ${formatMoney(payment.amount)}`

      doc.text(paymentDate, margin, y)
      doc.text(paymentAmount, margin + 50, y)
      doc.text(payment.reference || "-", margin + 100, y)
      y += 6
    }
    y += 5
  }

  doc.setLineWidth(0.3)
  doc.line(pageWidth - 85, y, pageWidth - margin, y)

  y += 8

  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.text("TOTAL", pageWidth - 85, y)
  doc.text(`${data.currency} ${formatMoney(data.amount)}`, pageWidth - margin, y, { align: "right" })

  y += 4
  doc.line(pageWidth - 85, y, pageWidth - margin, y)

  if (data.saldoRestante > 0) {
    y += 15
    doc.setFillColor(255, 243, 205)
    doc.rect(margin, y - 5, pageWidth - margin * 2, 18, "F")

    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(133, 100, 4)
    doc.text("SALDO PENDIENTE DE PAGO:", margin + 5, y + 3)

    doc.setFontSize(12)
    doc.text(
      `${receiptCurrency} ${formatMoney(data.saldoRestante)}`,
      pageWidth - margin - 5,
      y + 3,
      { align: "right" }
    )

    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.text(
      `(${totalContextLabel}: ${receiptCurrency} ${formatMoney(data.totalOperacion)} - Pagado: ${receiptCurrency} ${formatMoney(data.totalPagado)})`,
      margin + 5,
      y + 10
    )

    doc.setTextColor(0, 0, 0)
    y += 20
  } else if (data.totalOperacion > 0) {
    y += 15
    doc.setFillColor(209, 250, 229)
    doc.rect(margin, y - 5, pageWidth - margin * 2, 12, "F")

    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(22, 101, 52)
    doc.text("PAGADO EN SU TOTALIDAD", pageWidth / 2, y + 3, { align: "center" })

    doc.setTextColor(0, 0, 0)
    y += 15
  }

  y += 15

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(0, 0, 0)
  doc.line(margin, y, margin + 65, y)
  doc.text("Firma Cliente", margin + 18, y + 6)
  doc.line(pageWidth - margin - 65, y, pageWidth - margin, y)
  doc.text("Firma Agencia", pageWidth - margin - 48, y + 6)

  const footerY = pageHeight - 15
  doc.setFontSize(7)
  doc.setFont("helvetica", "italic")
  doc.setTextColor(128, 128, 128)
  doc.text(
    "LOZADA VIAJES - Corrientes 631 (Piso 1 Oficina F) Rosario, Santa Fe",
    pageWidth / 2,
    footerY - 3,
    { align: "center" }
  )
  doc.text(
    "Este recibo es valido como comprobante de pago. No valido como factura.",
    pageWidth / 2,
    footerY + 1,
    { align: "center" }
  )

  doc.save(`recibo-${data.receiptNumber}.pdf`)
}
