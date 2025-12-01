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
    const supabase = await createServerClient()

    // Obtener pago con datos relacionados
    const { data: payment, error } = await (supabase.from("payments") as any)
      .select(`
        *,
        operations:operation_id (
          id,
          file_code,
          destination,
          agencies:agency_id (id, name, city, phone, email)
        )
      `)
      .eq("id", paymentId)
      .single()

    if (error || !payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    // Si el pago está asociado a una operación con clientes, obtener el cliente principal
    let customerName = "Cliente"
    if (payment.operations?.id) {
      const { data: mainCustomer } = await (supabase
        .from("operation_customers") as any)
        .select(`
          customers:customer_id (first_name, last_name)
        `)
        .eq("operation_id", payment.operations.id)
        .eq("role", "MAIN")
        .single()

      if (mainCustomer?.customers) {
        const c = mainCustomer.customers as any
        customerName = `${c.first_name} ${c.last_name}`
      }
    }

    const agency = payment.operations?.agencies

    // Crear PDF
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let y = 20

    // === HEADER ===
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.text("RECIBO DE PAGO", pageWidth / 2, y, { align: "center" })
    y += 15

    // Datos de la agencia
    doc.setFontSize(12)
    doc.setFont("helvetica", "normal")
    if (agency) {
      doc.text(agency.name, pageWidth / 2, y, { align: "center" })
      y += 6
      if (agency.city) {
        doc.text(agency.city, pageWidth / 2, y, { align: "center" })
        y += 6
      }
      if (agency.phone) {
        doc.text(`Tel: ${agency.phone}`, pageWidth / 2, y, { align: "center" })
        y += 6
      }
    }

    y += 10

    // Número de recibo
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.rect(pageWidth - margin - 60, y - 10, 60, 20)
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Recibo Nº:", pageWidth - margin - 55, y - 2)
    doc.setFontSize(14)
    doc.text(paymentId.slice(0, 8).toUpperCase(), pageWidth - margin - 55, y + 6)

    y += 20

    // Línea separadora
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 15

    // === DATOS DEL RECIBO ===
    doc.setFontSize(11)
    
    // Fecha
    doc.setFont("helvetica", "bold")
    doc.text("Fecha:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(format(new Date(payment.date_paid || payment.date_due), "dd 'de' MMMM 'de' yyyy", { locale: es }), margin + 40, y)
    y += 10

    // Recibido de
    doc.setFont("helvetica", "bold")
    doc.text("Recibido de:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(customerName, margin + 40, y)
    y += 10

    // Concepto
    doc.setFont("helvetica", "bold")
    doc.text("Concepto:", margin, y)
    doc.setFont("helvetica", "normal")
    const concepto = payment.operations?.destination 
      ? `Pago por viaje a ${payment.operations.destination}`
      : "Pago de servicios turísticos"
    doc.text(concepto, margin + 40, y)
    y += 10

    // Operación (si existe)
    if (payment.operations?.file_code) {
      doc.setFont("helvetica", "bold")
      doc.text("Operación:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(payment.operations.file_code, margin + 40, y)
      y += 10
    }

    // Método de pago
    doc.setFont("helvetica", "bold")
    doc.text("Método:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(payment.method || "-", margin + 40, y)
    y += 10

    // Referencia
    if (payment.reference) {
      doc.setFont("helvetica", "bold")
      doc.text("Referencia:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(payment.reference, margin + 40, y)
      y += 10
    }

    y += 15

    // === MONTO ===
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y, pageWidth - 2 * margin, 25, "F")
    
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("MONTO RECIBIDO:", margin + 10, y + 10)
    
    doc.setFontSize(18)
    const formattedAmount = `${payment.currency} ${payment.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
    doc.text(formattedAmount, pageWidth - margin - 10, y + 15, { align: "right" })

    y += 40

    // === FIRMAS ===
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    
    // Línea firma izquierda
    doc.line(margin, y + 20, margin + 60, y + 20)
    doc.text("Firma Cliente", margin + 15, y + 28)

    // Línea firma derecha
    doc.line(pageWidth - margin - 60, y + 20, pageWidth - margin, y + 20)
    doc.text("Firma Agencia", pageWidth - margin - 45, y + 28)

    // === FOOTER ===
    const footerY = doc.internal.pageSize.getHeight() - 25
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.setTextColor(128, 128, 128)
    doc.text("Este recibo es válido como comprobante de pago.", pageWidth / 2, footerY, { align: "center" })
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, pageWidth / 2, footerY + 5, { align: "center" })

    // Generar buffer
    const pdfBuffer = doc.output("arraybuffer")

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="recibo-${paymentId.slice(0, 8)}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating receipt PDF:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

