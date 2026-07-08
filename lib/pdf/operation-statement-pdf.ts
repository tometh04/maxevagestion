/**
 * Generador del PDF "Detalle de la Operación" (Liquidación de Servicios).
 *
 * Server-side jsPDF (mismo patrón que app/api/operations/[id]/itinerary/pdf y
 * /voucher: `new jsPDF(...)` + `doc.output("arraybuffer")`). Función pura:
 * recibe todos los datos ya armados por `buildOperationStatementData` y NO toca
 * Supabase, para poder reutilizarse desde el endpoint de descarga y el de email.
 *
 * Layout inspirado en el ejemplo de la clienta (Milla Cero):
 *   - Header con branding de la agencia + "LIQUIDACIÓN DE SERVICIOS Nº".
 *   - Datos de la operación (cliente, vendedor, salida, nº pasajeros).
 *   - Listado de servicios contratados (servicio / cant / detalle / importe).
 *   - VALORES: fecha máxima de pago + importe a pagar.
 *   - Footer con datos de contacto de la agencia.
 */

import jsPDF from "jspdf"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { OperationStatementData } from "@/lib/operations/statement-data"

// Paleta (teal sobrio, similar al ejemplo de referencia)
const TEAL = [23, 105, 122] as const // #17697A
const DARK = [45, 55, 60] as const
const GRAY = [120, 128, 133] as const
const LIGHT_ROW = [244, 247, 248] as const
const WHITE = [255, 255, 255] as const

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  try {
    return format(new Date(dateStr + "T12:00:00"), "dd/MM/yyyy", { locale: es })
  } catch {
    return dateStr
  }
}

function fmtMoney(amount: number | null, currency: string): string {
  if (amount == null) return "-"
  return `${currency} ${amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Renderiza el PDF y devuelve el ArrayBuffer (listo para Response o para
 * adjuntar por email como Buffer).
 */
export function generateOperationStatementPdf(
  data: OperationStatementData
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = 210
  const marginLeft = 15
  const marginRight = 15
  const contentWidth = pageWidth - marginLeft - marginRight
  const rightEdge = pageWidth - marginRight
  let y = 16

  // ============ HEADER ============
  // Logo o nombre de la empresa (izquierda)
  let headerBottom = y
  if (data.company.logo) {
    try {
      doc.addImage(data.company.logo, "PNG", marginLeft, y, 45, 20)
      headerBottom = y + 22
    } catch {
      doc.setFontSize(20)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...TEAL)
      doc.text(data.company.name.toUpperCase(), marginLeft, y + 8)
      headerBottom = y + 14
    }
  } else {
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...TEAL)
    doc.text(data.company.name.toUpperCase(), marginLeft, y + 8)
    headerBottom = y + 14
  }

  // Título del documento (derecha)
  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK)
  doc.text("LIQUIDACIÓN DE SERVICIOS", rightEdge, y + 6, { align: "right" })
  doc.setFontSize(11)
  doc.setTextColor(...TEAL)
  doc.text(`Nº ${data.fileCode}`, rightEdge, y + 12, { align: "right" })

  // Datos de la empresa (izquierda, debajo del logo/nombre)
  y = Math.max(headerBottom, y + 16) + 2
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRAY)
  const companyLines = [
    data.company.address,
    data.company.taxId ? `CUIT: ${data.company.taxId}` : "",
    [data.company.phone, data.company.email].filter(Boolean).join(" · "),
    data.company.website,
  ].filter(Boolean)
  for (const line of companyLines) {
    doc.text(line, marginLeft, y)
    y += 4
  }

  y += 4
  doc.setDrawColor(...TEAL)
  doc.setLineWidth(0.5)
  doc.line(marginLeft, y, rightEdge, y)
  y += 8

  // ============ DATOS DE LA OPERACIÓN ============
  const labelValue = (label: string, value: string, x: number, yy: number) => {
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...GRAY)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...DARK)
    doc.text(value || "-", x, yy + 5)
  }

  const col2 = marginLeft + contentWidth / 2
  labelValue("Cliente", data.customerName, marginLeft, y)
  labelValue("Vendedor", data.sellerName, col2, y)
  y += 13
  labelValue("Fecha de salida", fmtDate(data.departureDate), marginLeft, y)
  labelValue("Fecha de regreso", fmtDate(data.returnDate), col2, y)
  y += 13
  labelValue("Destino", data.destination, marginLeft, y)
  labelValue("Total de pasajeros", String(data.passengerCount), col2, y)
  y += 13
  labelValue(
    "Fecha de liquidación",
    format(new Date(), "dd/MM/yyyy", { locale: es }),
    marginLeft,
    y
  )
  y += 16

  // ============ LISTADO DE SERVICIOS ============
  const sectionHeading = (title: string, yy: number): number => {
    doc.setFillColor(...TEAL)
    doc.rect(marginLeft, yy, contentWidth, 7, "F")
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...WHITE)
    doc.text(title.toUpperCase(), marginLeft + 3, yy + 4.8)
    return yy + 7
  }

  y = sectionHeading("Listado de Servicios Contratados", y)

  // La columna IMPORTE (precio de venta por servicio) solo se muestra si al menos
  // un servicio tiene monto de venta cargado. Si ninguno lo tiene, se oculta para
  // no mostrar una columna llena de "-" (el total sigue apareciendo en VALORES).
  // Nunca se muestra el costo: acá solo vive `sale_amount`.
  const showAmounts = data.services.some((s) => s.amount != null)

  // Columnas: Servicio | Cant | Detalle | (Importe)
  const colService = marginLeft + 3
  const colQty = marginLeft + 75
  const colDetail = marginLeft + 92
  const colAmount = rightEdge - 3
  // Borde derecho del texto de detalle: si hay columna de importe, dejar lugar;
  // si no, el detalle ocupa hasta el margen derecho.
  const detailRightEdge = showAmounts ? colAmount - 14 : rightEdge - 3

  // Encabezado de tabla
  y += 5
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...GRAY)
  doc.text("SERVICIO", colService, y)
  doc.text("CANT", colQty, y)
  doc.text("DETALLE", colDetail, y)
  if (showAmounts) {
    doc.text("IMPORTE", colAmount, y, { align: "right" })
  }
  y += 2
  doc.setDrawColor(...LIGHT_ROW)
  doc.setLineWidth(0.3)
  doc.line(marginLeft, y, rightEdge, y)
  y += 4

  const ensureSpace = (needed: number) => {
    if (y + needed > 275) {
      doc.addPage()
      y = 20
    }
  }

  doc.setFont("helvetica", "normal")
  let rowIdx = 0
  for (const svc of data.services) {
    ensureSpace(9)
    const detailLines = doc.splitTextToSize(svc.description || "-", detailRightEdge - colDetail)
    const rowHeight = Math.max(7, 3 + detailLines.length * 4)

    // Zebra striping
    if (rowIdx % 2 === 1) {
      doc.setFillColor(...LIGHT_ROW)
      doc.rect(marginLeft, y - 4, contentWidth, rowHeight, "F")
    }

    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...DARK)
    doc.text(svc.label, colService, y)

    doc.setFont("helvetica", "normal")
    doc.setTextColor(...DARK)
    doc.text(String(svc.quantity), colQty, y)

    doc.setTextColor(...GRAY)
    doc.text(detailLines, colDetail, y)

    if (showAmounts) {
      doc.setTextColor(...DARK)
      doc.setFont("helvetica", "bold")
      doc.text(fmtMoney(svc.amount, svc.currency), colAmount, y, { align: "right" })
    }

    y += rowHeight
    rowIdx++
  }

  y += 8

  // ============ VALORES ============
  ensureSpace(30)
  y = sectionHeading("Valores", y)
  y += 8

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...DARK)
  const dueText = data.dueDate
    ? `Fecha máxima para completar el pago: ${fmtDate(data.dueDate)}`
    : "Fecha máxima para completar el pago: a convenir"
  doc.text(dueText, marginLeft, y)

  // Importe a pagar (destacado a la derecha)
  doc.setFillColor(...TEAL)
  const boxW = 80
  const boxH = 12
  const boxX = rightEdge - boxW
  doc.rect(boxX, y - 8, boxW, boxH, "F")
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...WHITE)
  doc.text(
    `IMPORTE A PAGAR ${fmtMoney(data.totalAmount, data.currency)}`,
    rightEdge - 3,
    y,
    { align: "right" }
  )

  // ============ FOOTER ============
  const footerY = 285
  doc.setFillColor(...TEAL)
  doc.rect(0, footerY - 4, pageWidth, 18, "F")
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...WHITE)
  const footerParts = [
    data.company.name,
    data.company.address,
    data.company.phone,
    data.company.website,
  ].filter(Boolean)
  doc.text(footerParts.join("  ·  "), pageWidth / 2, footerY + 1, {
    align: "center",
  })
  doc.text(
    "Todos los servicios detallados están sujetos al pago efectivo de los mismos.",
    pageWidth / 2,
    footerY + 6,
    { align: "center" }
  )

  return doc.output("arraybuffer")
}
