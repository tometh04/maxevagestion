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
    const { id: quotationId } = await params
    const supabase = await createServerClient()

    // Obtener cotización con datos relacionados
    const { data: quotation, error } = await (supabase.from("quotations") as any)
      .select(`
        *,
        agencies:agency_id (id, name, city, phone, email),
        sellers:seller_id (id, name, email),
        operators:operator_id (id, name),
        leads:lead_id (id, contact_name, contact_email, contact_phone)
      `)
      .eq("id", quotationId)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // Crear PDF
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let y = 20

    // === HEADER ===
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.text(quotation.agencies?.name || "Agencia de Viajes", margin, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    if (quotation.agencies?.city) {
      doc.text(quotation.agencies.city, margin, y)
      y += 5
    }
    if (quotation.agencies?.phone) {
      doc.text(`Tel: ${quotation.agencies.phone}`, margin, y)
      y += 5
    }
    if (quotation.agencies?.email) {
      doc.text(`Email: ${quotation.agencies.email}`, margin, y)
      y += 5
    }

    // Número de cotización (derecha)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text(`Cotización: ${quotation.quotation_number}`, pageWidth - margin, 20, { align: "right" })
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.text(`Fecha: ${format(new Date(quotation.created_at), "dd/MM/yyyy", { locale: es })}`, pageWidth - margin, 28, { align: "right" })
    doc.text(`Válida hasta: ${format(new Date(quotation.valid_until), "dd/MM/yyyy", { locale: es })}`, pageWidth - margin, 35, { align: "right" })

    y += 15

    // Línea separadora
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 10

    // === DATOS DEL CLIENTE ===
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("DATOS DEL CLIENTE", margin, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    if (quotation.leads?.contact_name) {
      doc.text(`Nombre: ${quotation.leads.contact_name}`, margin, y)
      y += 5
    }
    if (quotation.leads?.contact_email) {
      doc.text(`Email: ${quotation.leads.contact_email}`, margin, y)
      y += 5
    }
    if (quotation.leads?.contact_phone) {
      doc.text(`Teléfono: ${quotation.leads.contact_phone}`, margin, y)
      y += 5
    }

    y += 10

    // === DETALLE DEL VIAJE ===
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("DETALLE DEL VIAJE", margin, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    
    const details = [
      ["Destino:", quotation.destination],
      ["Origen:", quotation.origin || "-"],
      ["Fecha de salida:", format(new Date(quotation.departure_date), "dd/MM/yyyy", { locale: es })],
      ["Fecha de regreso:", quotation.return_date ? format(new Date(quotation.return_date), "dd/MM/yyyy", { locale: es }) : "-"],
      ["Pasajeros:", `${quotation.adults} adultos, ${quotation.children} niños, ${quotation.infants} bebés`],
      ["Operador:", quotation.operators?.name || "-"],
    ]

    details.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold")
      doc.text(label, margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(String(value), margin + 45, y)
      y += 6
    })

    y += 10

    // === PRECIOS ===
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("DETALLE DE PRECIOS", margin, y)
    y += 8

    // Tabla de precios
    const formatCurrency = (amount: number) => {
      return `${quotation.currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
    }

    doc.setFontSize(10)
    const priceItems = [
      ["Subtotal:", formatCurrency(quotation.subtotal || 0)],
      ["Descuentos:", `- ${formatCurrency(quotation.discounts || 0)}`],
      ["Impuestos:", formatCurrency(quotation.taxes || 0)],
    ]

    priceItems.forEach(([label, value]) => {
      doc.setFont("helvetica", "normal")
      doc.text(label, margin, y)
      doc.text(String(value), pageWidth - margin - 50, y)
      y += 6
    })

    // Total destacado
    y += 3
    doc.setDrawColor(0, 0, 0)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.text("TOTAL:", margin, y)
    doc.text(formatCurrency(quotation.total_amount), pageWidth - margin - 50, y)
    y += 15

    // === NOTAS ===
    if (quotation.notes) {
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("NOTAS", margin, y)
      y += 8

      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      const notesLines = doc.splitTextToSize(quotation.notes, pageWidth - 2 * margin)
      doc.text(notesLines, margin, y)
      y += notesLines.length * 5 + 10
    }

    // === TÉRMINOS Y CONDICIONES ===
    if (quotation.terms_and_conditions) {
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("TÉRMINOS Y CONDICIONES", margin, y)
      y += 8

      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      const termsLines = doc.splitTextToSize(quotation.terms_and_conditions, pageWidth - 2 * margin)
      doc.text(termsLines, margin, y)
    }

    // === FOOTER ===
    const footerY = doc.internal.pageSize.getHeight() - 20
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.text("Este documento es una cotización y no representa un compromiso de venta.", margin, footerY)
    doc.text(`Generado el ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, pageWidth - margin, footerY, { align: "right" })

    // Generar buffer
    const pdfBuffer = doc.output("arraybuffer")

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cotizacion-${quotation.quotation_number}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating quotation PDF:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

