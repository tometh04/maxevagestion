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
    const { id: operationId } = await params
    const supabase = await createServerClient()

    // Obtener operación con datos relacionados
    const { data: operation, error } = await (supabase.from("operations") as any)
      .select(`
        *,
        agencies:agency_id (id, name, city, phone, email),
        sellers:seller_id (id, name, email, phone),
        operators:operator_id (id, name, contact_phone, contact_email)
      `)
      .eq("id", operationId)
      .single()

    if (error || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Obtener pasajeros
    const { data: passengers } = await supabase
      .from("operation_customers")
      .select(`
        role,
        customers:customer_id (
          first_name,
          last_name,
          document_type,
          document_number,
          phone,
          email
        )
      `)
      .eq("operation_id", operationId)

    // Crear PDF
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let y = 20

    // === HEADER ===
    doc.setFillColor(41, 128, 185)
    doc.rect(0, 0, pageWidth, 40, "F")
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(24)
    doc.setFont("helvetica", "bold")
    doc.text("VOUCHER DE VIAJE", pageWidth / 2, 25, { align: "center" })
    
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.text(operation.agencies?.name || "Agencia de Viajes", pageWidth / 2, 35, { align: "center" })

    y = 55
    doc.setTextColor(0, 0, 0)

    // === CÓDIGO DE OPERACIÓN ===
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text(`Código: ${operation.file_code || operationId.slice(0, 8).toUpperCase()}`, margin, y)
    doc.text(`Estado: ${operation.status}`, pageWidth - margin, y, { align: "right" })
    y += 15

    // Línea separadora
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 10

    // === INFORMACIÓN DEL VIAJE ===
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 5, pageWidth - 2 * margin, 10, "F")
    doc.text("INFORMACIÓN DEL VIAJE", margin + 5, y + 2)
    y += 15

    doc.setFontSize(11)
    const travelInfo = [
      ["Destino:", operation.destination],
      ["Origen:", operation.origin || "-"],
      ["Salida:", format(new Date(operation.departure_date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es })],
      ["Regreso:", operation.return_date ? format(new Date(operation.return_date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es }) : "-"],
      ["Tipo:", operation.type],
      ["Operador:", operation.operators?.name || "-"],
    ]

    travelInfo.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold")
      doc.text(label, margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(String(value), margin + 35, y)
      y += 7
    })

    y += 10

    // === PASAJEROS ===
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 5, pageWidth - 2 * margin, 10, "F")
    doc.text("PASAJEROS", margin + 5, y + 2)
    y += 15

    doc.setFontSize(10)
    if (passengers && passengers.length > 0) {
      passengers.forEach((p: any, index: number) => {
        const customer = p.customers
        if (!customer) return

        doc.setFont("helvetica", "bold")
        doc.text(`${index + 1}. ${customer.first_name} ${customer.last_name}`, margin, y)
        doc.setFont("helvetica", "normal")
        doc.text(`(${p.role === "MAIN" ? "Titular" : "Acompañante"})`, margin + 80, y)
        y += 6

        if (customer.document_type && customer.document_number) {
          doc.text(`   ${customer.document_type}: ${customer.document_number}`, margin, y)
          y += 6
        }
        y += 3
      })
    } else {
      doc.setFont("helvetica", "normal")
      doc.text("No hay pasajeros registrados", margin, y)
      y += 10
    }

    y += 5

    // === CONTACTOS DE EMERGENCIA ===
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 5, pageWidth - 2 * margin, 10, "F")
    doc.text("CONTACTOS DE EMERGENCIA", margin + 5, y + 2)
    y += 15

    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Agencia:", margin, y)
    doc.setFont("helvetica", "normal")
    y += 6
    doc.text(`   ${operation.agencies?.name}`, margin, y)
    y += 5
    if (operation.agencies?.phone) {
      doc.text(`   Tel: ${operation.agencies.phone}`, margin, y)
      y += 5
    }
    if (operation.agencies?.email) {
      doc.text(`   Email: ${operation.agencies.email}`, margin, y)
      y += 5
    }

    y += 5
    doc.setFont("helvetica", "bold")
    doc.text("Vendedor asignado:", margin, y)
    doc.setFont("helvetica", "normal")
    y += 6
    doc.text(`   ${operation.sellers?.name}`, margin, y)
    y += 5
    if (operation.sellers?.phone) {
      doc.text(`   Tel: ${operation.sellers.phone}`, margin, y)
      y += 5
    }
    if (operation.sellers?.email) {
      doc.text(`   Email: ${operation.sellers.email}`, margin, y)
      y += 5
    }

    if (operation.operators) {
      y += 5
      doc.setFont("helvetica", "bold")
      doc.text("Operador:", margin, y)
      doc.setFont("helvetica", "normal")
      y += 6
      doc.text(`   ${operation.operators.name}`, margin, y)
      y += 5
      if (operation.operators.contact_phone) {
        doc.text(`   Tel: ${operation.operators.contact_phone}`, margin, y)
        y += 5
      }
    }

    // === FOOTER ===
    const footerY = doc.internal.pageSize.getHeight() - 30
    doc.setDrawColor(41, 128, 185)
    doc.setLineWidth(0.5)
    doc.line(margin, footerY, pageWidth - margin, footerY)

    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.text("Este voucher debe ser presentado al momento del check-in.", margin, footerY + 8)
    doc.text("¡Buen viaje!", pageWidth / 2, footerY + 15, { align: "center" })
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, pageWidth - margin, footerY + 15, { align: "right" })

    // Generar buffer
    const pdfBuffer = doc.output("arraybuffer")

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="voucher-${operation.file_code || operationId.slice(0, 8)}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating voucher PDF:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

