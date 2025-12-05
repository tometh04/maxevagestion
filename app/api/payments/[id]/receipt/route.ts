import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import jsPDF from "jspdf"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: paymentId } = await params
    
    console.log("Generating receipt for payment:", paymentId)
    
    const supabase = await createServerClient()

    // Obtener pago con datos relacionados
    const { data: payment, error } = await (supabase.from("payments") as any)
      .select(`
        *,
        operations:operation_id (
          id,
          file_code,
          destination,
          agencies:agency_id (id, name, city, phone, email, address)
        )
      `)
      .eq("id", paymentId)
      .single()

    if (error) {
      console.error("Error fetching payment:", error)
      return NextResponse.json({ error: "Error al obtener pago: " + error.message }, { status: 500 })
    }
    
    if (!payment) {
      console.error("Payment not found:", paymentId)
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    console.log("Payment found:", payment.id)

    // Si el pago está asociado a una operación con clientes, obtener el cliente principal
    let customerName = "Cliente"
    let customerAddress = ""
    let customerCity = ""
    
    if (payment.operations?.id) {
      const { data: mainCustomer } = await (supabase
        .from("operation_customers") as any)
        .select(`
          customers:customer_id (first_name, last_name, address, city)
        `)
        .eq("operation_id", payment.operations.id)
        .eq("role", "MAIN")
        .single()

      if (mainCustomer?.customers) {
        const c = mainCustomer.customers as any
        customerName = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Cliente"
        customerAddress = c.address || ""
        customerCity = c.city || ""
      }
    }

    const agency = payment.operations?.agencies
    const agencyCity = agency?.city || "Rosario"

    // Generar número de recibo (basado en el ID)
    // Formato: 1000-00000XXX (donde XXX son los últimos 4 dígitos del ID convertido a número)
    const receiptNumber = `1000-${paymentId.replace(/-/g, "").slice(-8).toUpperCase()}`

    // Crear PDF - Formato similar al modelo de Lozada
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let y = 25

    // === HEADER ===
    // Fecha y lugar (izquierda)
    doc.setFontSize(11)
    doc.setFont("helvetica", "normal")
    const fechaPago = payment.date_paid || payment.date_due || new Date().toISOString()
    const fechaFormateada = format(new Date(fechaPago), "d 'de' MMMM 'de' yyyy", { locale: es })
    doc.text(`${agencyCity} ${fechaFormateada}`, margin, y)

    // Número de recibo (derecha) - en negrita y más grande
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text(`RECIBO X: Nº ${receiptNumber}`, pageWidth - margin, y, { align: "right" })

    y += 20

    // Línea separadora
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
    
    y += 15

    // === DATOS DEL CLIENTE ===
    doc.setFontSize(11)
    
    // Señor:
    doc.setFont("helvetica", "bold")
    doc.text("Señor:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(customerName, margin + 25, y)
    
    y += 10
    
    // Domicilio:
    doc.setFont("helvetica", "bold")
    doc.text("Domicilio:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(customerAddress || "-", margin + 30, y)
    
    y += 10
    
    // Localidad:
    doc.setFont("helvetica", "bold")
    doc.text("Localidad:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(customerCity || "-", margin + 30, y)

    y += 20

    // === MONTO RECIBIDO ===
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    const currencyName = payment.currency === "USD" ? "Dolar" : "Pesos"
    const amount = Number(payment.amount) || 0
    doc.text(`Recibimos el equivalente a ${currencyName}: ${amount.toLocaleString("es-AR")}`, margin, y)

    y += 15

    // === CONCEPTO ===
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    
    // Concepto del pago
    let concepto = payment.reference || ""
    if (!concepto && payment.operations?.destination) {
      concepto = `Pago viaje ${payment.operations.destination}`
    }
    if (!concepto) {
      concepto = "Pago de servicios turísticos"
    }
    
    // Si hay notas adicionales, agregarlas
    if (payment.notes && payment.notes !== payment.reference) {
      concepto += ` - ${payment.notes}`
    }
    
    doc.text(concepto, margin, y)

    y += 15

    // Moneda recibida
    doc.setFont("helvetica", "bold")
    doc.text("Moneda recibida:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(currencyName, margin + 45, y)

    y += 25

    // === TOTAL ===
    // Línea arriba del total
    doc.setLineWidth(0.3)
    doc.line(pageWidth - 80, y, pageWidth - margin, y)
    
    y += 10
    
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.text("TOTAL", pageWidth - 80, y)
    
    const totalFormatted = `${payment.currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`
    doc.text(totalFormatted, pageWidth - margin, y, { align: "right" })

    // Línea debajo del total
    y += 5
    doc.line(pageWidth - 80, y, pageWidth - margin, y)

    y += 30

    // === FIRMAS ===
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    
    // Línea firma izquierda
    doc.line(margin, y, margin + 70, y)
    doc.text("Firma Cliente", margin + 20, y + 8)

    // Línea firma derecha
    doc.line(pageWidth - margin - 70, y, pageWidth - margin, y)
    doc.text("Firma Agencia", pageWidth - margin - 50, y + 8)

    // === FOOTER ===
    const footerY = doc.internal.pageSize.getHeight() - 20
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.setTextColor(128, 128, 128)
    
    if (agency?.name) {
      doc.text(agency.name, pageWidth / 2, footerY - 5, { align: "center" })
    }
    doc.text("Este recibo es válido como comprobante de pago.", pageWidth / 2, footerY, { align: "center" })

    // Generar buffer
    const pdfBuffer = doc.output("arraybuffer")

    console.log("Receipt PDF generated successfully")

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="recibo-${receiptNumber}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating receipt PDF:", error)
    return NextResponse.json({ error: "Error al generar recibo: " + error.message }, { status: 500 })
  }
}
