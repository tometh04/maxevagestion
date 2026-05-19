import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import jsPDF from "jspdf"
import { format } from "date-fns"
import { es } from "date-fns/locale"

// Colors matching brand (golden/orange)
const GOLD = [196, 155, 42] as const   // #C49B2A - golden
const DARK = [51, 51, 51] as const     // #333333
const GRAY = [120, 120, 120] as const  // #787878
const LIGHT_GRAY = [200, 200, 200] as const

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  try {
    return format(new Date(dateStr + "T12:00:00"), "dd MMM yyyy", { locale: es })
  } catch {
    return dateStr
  }
}

function drawStars(doc: jsPDF, x: number, y: number, count: number) {
  doc.setFontSize(10)
  doc.setTextColor(...GOLD)
  doc.text("★".repeat(count), x, y)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params
    const supabase = await createServerClient()

    // Cross-tenant fix (2026-05-18): scopear operation fetch por org del user.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Fetch organization settings for PDF branding
    const { data: orgSettings } = await (supabase.from("organization_settings") as any)
      .select("key, value")

    const getOrgSetting = (key: string, fallback: string = '') =>
      orgSettings?.find((s: any) => s.key === key)?.value || fallback

    const companyName = getOrgSetting('company_name', 'Mi Empresa')
    const companyAddress = getOrgSetting('address', '')
    const companyPhone = getOrgSetting('phone', '')
    const companyWebsite = getOrgSetting('website', '')
    const companyTaxId = getOrgSetting('tax_id', '')
    const companyLogo = getOrgSetting('brand_logo', '')

    // Fetch operation with customers (scopeada por org)
    const { data: operation } = await (supabase.from("operations") as any)
      .select(`
        *,
        operation_customers(
          role,
          customers(id, first_name, last_name, full_name, document_number)
        )
      `)
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (!operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Fetch itinerary items
    const { data: items } = await (supabase.from("itinerary_items") as any)
      .select("*")
      .eq("operation_id", operationId)
      .order("sort_order", { ascending: true })

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No hay items en el itinerario" }, { status: 400 })
    }

    // Build PDF
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageWidth = 210
    const marginLeft = 15
    const marginRight = 15
    const contentWidth = pageWidth - marginLeft - marginRight
    let y = 15

    // === HEADER: Logo + Title ===
    if (companyLogo) {
      try {
        doc.addImage(companyLogo, "PNG", pageWidth - marginRight - 40, y - 5, 40, 18)
      } catch {
        // Fallback to text if logo fails to load
        doc.setFontSize(24)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...GOLD)
        doc.text(companyName.toUpperCase(), pageWidth - marginRight, y + 5, { align: "right" })
      }
    } else {
      doc.setFontSize(24)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...GOLD)
      doc.text(companyName.toUpperCase(), pageWidth - marginRight, y + 5, { align: "right" })
    }

    y += 25

    // Title
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...DARK)
    const destination = (operation.destination || "").toUpperCase()
    const departureFormatted = operation.departure_date
      ? format(new Date(operation.departure_date + "T12:00:00"), "dd 'de' MMMM", { locale: es }).toUpperCase()
      : ""
    doc.text(`DETALLE DE COMPRA ${destination} - SALIDA ${departureFormatted}`, marginLeft, y)

    y += 3
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(0.5)
    doc.line(marginLeft, y, pageWidth - marginRight, y)
    y += 8

    // === ITINERARY BLOCKS ===
    for (const item of items) {
      // Check if we need a new page
      if (y > 260) {
        doc.addPage()
        y = 15
        // Repeat logo on each page
        if (companyLogo) {
          try {
            doc.addImage(companyLogo, "PNG", pageWidth - marginRight - 35, y - 5, 35, 15)
          } catch {
            doc.setFontSize(18)
            doc.setFont("helvetica", "bold")
            doc.setTextColor(...GOLD)
            doc.text(companyName.toUpperCase(), pageWidth - marginRight, y, { align: "right" })
          }
        } else {
          doc.setFontSize(18)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(...GOLD)
          doc.text(companyName.toUpperCase(), pageWidth - marginRight, y, { align: "right" })
        }
        y += 15
      }

      switch (item.item_type) {
        case "FLIGHT": {
          doc.setFontSize(10)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(...DARK)
          const emoji = "✈"
          const route = item.flight_route || ""
          const airline = item.airline ? ` CON ${item.airline.toUpperCase()}` : ""
          const flightDate = item.flight_date ? ` ${formatDate(item.flight_date).toUpperCase()}` : ""
          doc.text(`${emoji} ${route.toUpperCase()}${airline}${flightDate}`, marginLeft, y)
          y += 8
          break
        }

        case "TRANSFER": {
          doc.setFontSize(9)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(...DARK)
          doc.text(`→ ${item.transfer_description || "Traslado"}`, marginLeft + 5, y)
          y += 6
          break
        }

        case "HOTEL": {
          // City header
          const city = (item.destination_city || item.hotel_name || "").toUpperCase()
          const dateRange = item.date_from && item.date_to
            ? `(${formatDate(item.date_from).toUpperCase()} AL ${formatDate(item.date_to).toUpperCase()})`
            : ""

          doc.setFontSize(11)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(...GOLD)
          doc.text(`📍 ${city} ${dateRange}`, marginLeft, y)
          y += 8

          // Hotel name and stars
          doc.setFontSize(11)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(...DARK)
          const stars = item.hotel_stars ? " " + "★".repeat(item.hotel_stars) : ""
          doc.text(`${item.hotel_name || "Hotel"}`, marginLeft + 5, y)
          if (item.hotel_stars) {
            doc.setTextColor(...GOLD)
            doc.text(stars, marginLeft + 5 + doc.getTextWidth(item.hotel_name || "Hotel") + 2, y)
          }
          y += 5

          // Address & phone
          if (item.hotel_address) {
            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(...GRAY)
            doc.text(item.hotel_address, marginLeft + 5, y)
            y += 4
          }
          if (item.hotel_phone) {
            doc.setFontSize(8)
            doc.setTextColor(...GOLD)
            doc.text(`Teléfono: ${item.hotel_phone}`, marginLeft + 5, y)
            y += 4
          }

          y += 2

          // Check-in / Check-out table
          doc.setFontSize(9)
          doc.setTextColor(...GRAY)
          doc.text("Entrada:", marginLeft + 5, y)
          doc.setTextColor(...DARK)
          doc.text(formatDate(item.checkin_date), marginLeft + 40, y)
          y += 5

          doc.setTextColor(...GRAY)
          doc.text("Salida:", marginLeft + 5, y)
          doc.setTextColor(...DARK)
          doc.text(formatDate(item.checkout_date), marginLeft + 40, y)
          y += 5

          if (item.rooms || item.nights) {
            doc.setTextColor(...GRAY)
            doc.text("Tu reserva:", marginLeft + 5, y)
            doc.setTextColor(...DARK)
            const reservaText = `${item.rooms || 1} Habitación(es) / ${item.nights || "-"} Noche(s)`
            doc.text(reservaText, marginLeft + 40, y)
            y += 5
          }

          // Room type and meal plan
          if (item.room_type || item.meal_plan) {
            y += 2
            doc.setFontSize(9)
            doc.setFont("helvetica", "bold")
            doc.setTextColor(...DARK)
            const roomInfo = [item.room_type, item.meal_plan].filter(Boolean).join(" - ")
            doc.text(roomInfo, marginLeft + 5, y)
            y += 5
          }

          // Passengers
          const customers = operation.operation_customers || []
          if (customers.length > 0) {
            doc.setFontSize(9)
            doc.setFont("helvetica", "bold")
            doc.setTextColor(...DARK)
            doc.text("Huéspedes:", marginLeft + 5, y)
            y += 4

            doc.setFont("helvetica", "normal")
            for (const oc of customers) {
              const name = oc.customers?.full_name ||
                `${oc.customers?.first_name || ""} ${oc.customers?.last_name || ""}`.trim()
              if (name) {
                doc.text(name, marginLeft + 5, y)
                y += 4
              }
            }
          }

          y += 5
          break
        }

        case "CAR": {
          doc.setFontSize(11)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(...GOLD)
          doc.text("🚗 Auto", marginLeft, y)
          y += 6

          if (item.car_company) {
            doc.setFontSize(9)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(...DARK)
            doc.text(item.car_company, marginLeft + 5, y)
            y += 4
          }
          if (item.car_details) {
            doc.setFontSize(8)
            doc.setTextColor(...GRAY)
            doc.text(item.car_details, marginLeft + 5, y)
            y += 4
          }

          // Pickup / Return
          if (item.car_pickup_date) {
            doc.setFontSize(9)
            doc.setTextColor(...GOLD)
            doc.text("Retiras el:", marginLeft + 5, y)
            doc.setTextColor(...DARK)
            doc.text(formatDate(item.car_pickup_date), marginLeft + 35, y)
            if (item.car_pickup_location) {
              doc.text(`en ${item.car_pickup_location}`, marginLeft + 70, y)
            }
            y += 5
          }
          if (item.car_return_date) {
            doc.setTextColor(...GOLD)
            doc.text("Devolvés el:", marginLeft + 5, y)
            doc.setTextColor(...DARK)
            doc.text(formatDate(item.car_return_date), marginLeft + 35, y)
            if (item.car_return_location) {
              doc.text(`en ${item.car_return_location}`, marginLeft + 70, y)
            }
            y += 5
          }

          y += 5
          break
        }

        case "NOTE": {
          if (item.notes) {
            doc.setFontSize(9)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(...DARK)
            const lines = doc.splitTextToSize(item.notes, contentWidth - 10)
            doc.text(lines, marginLeft + 5, y)
            y += lines.length * 4 + 3
          }
          break
        }
      }
    }

    // === TOTAL ===
    y += 10
    if (y > 260) {
      doc.addPage()
      y = 30
    }

    doc.setFontSize(13)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...GOLD)
    const currency = operation.sale_currency || operation.currency || "USD"
    const total = Math.round(operation.sale_amount_total || 0).toLocaleString("es-AR")
    const passengers = (operation.adults || 0) + (operation.children || 0)
    const perPerson = passengers > 0
      ? Math.round((operation.sale_amount_total || 0) / passengers).toLocaleString("es-AR")
      : total

    doc.text(`TOTAL POR PASAJERO ${currency} ${perPerson}`, marginLeft, y, { align: "left" })

    // === FOOTER ===
    const footerY = 282
    doc.setFillColor(...GOLD)
    doc.rect(0, footerY - 2, pageWidth, 15, "F")

    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(255, 255, 255)
    let footerLineY = footerY + 3
    if (companyTaxId) {
      doc.text(`CUIT: ${companyTaxId}`, marginLeft, footerLineY)
      footerLineY += 4
    }
    if (companyAddress) {
      doc.text(companyAddress, marginLeft, footerLineY)
      footerLineY += 4
    }
    if (companyWebsite) {
      doc.text(companyWebsite, marginLeft, footerLineY)
      footerLineY += 4
    }
    if (companyPhone) {
      doc.text(companyPhone, marginLeft, footerLineY)
    }

    // Return PDF as downloadable
    const pdfBuffer = doc.output("arraybuffer")

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Detalle_Compra_${operation.file_code || operationId}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("PDF generation error:", error)
    return NextResponse.json({ error: "Error al generar PDF" }, { status: 500 })
  }
}
