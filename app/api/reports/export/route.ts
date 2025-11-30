import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { applyReportsFilters, canPerformAction } from "@/lib/permissions-api"
import jsPDF from "jspdf"
import * as XLSX from "xlsx"

function escapeCsvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return ""
  }

  const stringValue = String(value)
  if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const reportType = searchParams.get("reportType") || "sales"
    const format = searchParams.get("format") || "csv"
    const agencyId = searchParams.get("agencyId")
    const sellerId = searchParams.get("sellerId")

    // Get user agencies
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Verificar permisos de reportes
    const reportsAccess = applyReportsFilters(user, agencyIds)
    if (!reportsAccess.canAccess) {
      return NextResponse.json({ error: "No tiene permiso para ver reportes" }, { status: 403 })
    }

    // Verificar permiso de exportación
    if (!canPerformAction(user, "reports", "export")) {
      return NextResponse.json({ error: "No tiene permiso para exportar reportes" }, { status: 403 })
    }

    // Si solo puede ver sus propios datos, forzar filtro de seller
    const effectiveSellerId = reportsAccess.ownDataOnly && user.role === "SELLER" 
      ? user.id 
      : (sellerId && sellerId !== "ALL" ? sellerId : undefined)

    // Prepare data structure for all formats
    let reportData: { headers: string[]; rows: any[][] } = { headers: [], rows: [] }

    switch (reportType) {
      case "sales": {
        // Build query for operations
        let query = supabase
          .from("operations")
          .select(
            `
            sale_amount_total,
            margin_amount,
            operator_cost,
            seller_id,
            sellers:seller_id(id, name),
            destination
          `
          )

        // Apply role-based filtering
        if (user.role === "SELLER") {
          query = query.eq("seller_id", user.id)
        } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
          query = query.in("agency_id", agencyIds)
        }

        // Apply filters
        if (dateFrom) {
          query = query.gte("created_at", dateFrom)
        }
        if (dateTo) {
          query = query.lte("created_at", dateTo)
        }
        if (agencyId && agencyId !== "ALL") {
          query = query.eq("agency_id", agencyId)
        }
        if (effectiveSellerId) {
          query = query.eq("seller_id", effectiveSellerId)
        }

        const { data: operations } = await query

        // Group by seller
        const sellerStats = (operations || []).reduce((acc: any, op: any) => {
          const sellerId = op.seller_id
          const sellerName = op.sellers?.name || "Sin nombre"

          if (!acc[sellerId]) {
            acc[sellerId] = {
              sellerName,
              totalSales: 0,
              totalMargin: 0,
              operationsCount: 0,
            }
          }

          acc[sellerId].totalSales += op.sale_amount_total || 0
          acc[sellerId].totalMargin += op.margin_amount || 0
          acc[sellerId].operationsCount += 1

          return acc
        }, {})

        const sellers = Object.values(sellerStats).map((seller: any) => ({
          ...seller,
          avgMarginPercent: seller.totalSales > 0 ? (seller.totalMargin / seller.totalSales) * 100 : 0,
        }))

        // Prepare data
        reportData = {
          headers: ["Vendedor", "Ventas", "Margen", "% Margen", "Operaciones"],
          rows: sellers.map((seller: any) => [
            seller.sellerName,
            seller.totalSales,
            seller.totalMargin,
            seller.avgMarginPercent.toFixed(2),
            seller.operationsCount,
          ]),
        }

        break
      }

      case "financial": {
        // Build query for cash movements
        let query = supabase
          .from("cash_movements")
          .select(
            `
            type,
            amount,
            movement_date,
            operations:operation_id(agency_id)
          `
          )
          .order("movement_date", { ascending: true })

        // Apply role-based filtering
        if (user.role === "SELLER") {
          query = query.eq("user_id", user.id)
        } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
          const { data: agencyOperations } = await supabase
            .from("operations")
            .select("id")
            .in("agency_id", agencyIds)

          const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)
          if (agencyOperationIds.length > 0) {
            query = query.in("operation_id", agencyOperationIds)
          } else {
            return NextResponse.json({ error: "No hay datos" }, { status: 404 })
          }
        }

        // Apply filters
        if (dateFrom) {
          query = query.gte("movement_date", dateFrom)
        }
        if (dateTo) {
          query = query.lte("movement_date", dateTo)
        }
        if (agencyId && agencyId !== "ALL") {
          const { data: agencyOperations } = await supabase
            .from("operations")
            .select("id")
            .eq("agency_id", agencyId)

          const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)
          if (agencyOperationIds.length > 0) {
            query = query.in("operation_id", agencyOperationIds)
          } else {
            return NextResponse.json({ error: "No hay datos" }, { status: 404 })
          }
        }

        const { data: movements } = await query

        // Group by date
        const cashflowByDate = (movements || []).reduce((acc: any, movement: any) => {
          const date = new Date(movement.movement_date).toISOString().split("T")[0]

          if (!acc[date]) {
            acc[date] = {
              date,
              income: 0,
              expense: 0,
              net: 0,
            }
          }

          if (movement.type === "INCOME") {
            acc[date].income += movement.amount || 0
          } else {
            acc[date].expense += movement.amount || 0
          }

          acc[date].net = acc[date].income - acc[date].expense

          return acc
        }, {})

        const cashflow = Object.values(cashflowByDate).sort((a: any, b: any) =>
          a.date.localeCompare(b.date)
        )

        // Prepare data
        reportData = {
          headers: ["Fecha", "Ingresos", "Egresos", "Neto"],
          rows: cashflow.map((item: any) => [item.date, item.income, item.expense, item.net]),
        }

        break
      }

      case "operators": {
        // Build query for operators
        let query = supabase.from("operators").select("id, name")

        const { data: operators } = await query

        // For each operator, calculate metrics
        const operatorsData = await Promise.all(
          (operators || []).map(async (op: any) => {
            let opQuery = supabase
              .from("operations")
              .select("operator_cost, payments:payments!operation_id(amount, status, direction)")
              .eq("operator_id", op.id)

            if (agencyId && agencyId !== "ALL") {
              opQuery = opQuery.eq("agency_id", agencyId)
            }

            const { data: operations } = await opQuery

            const operationsCount = (operations || []).length
            const totalCost = (operations || []).reduce((sum: number, o: any) => sum + (o.operator_cost || 0), 0)

            const paidAmount = (operations || []).reduce((sum: number, o: any) => {
              const payments = (o.payments || []) as any[]
              const paidPayments = payments.filter(
                (p: any) => p.direction === "EXPENSE" && p.status === "PAID"
              )
              return sum + paidPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
            }, 0)

            const balance = totalCost - paidAmount

            return {
              name: op.name,
              operationsCount,
              totalCost,
              totalPaid: paidAmount,
              balance,
            }
          })
        )

        // Prepare data
        reportData = {
          headers: ["Operador", "Operaciones", "Costo Total", "Pagado", "Saldo"],
          rows: operatorsData.map((op: any) => [
            op.name,
            op.operationsCount,
            op.totalCost,
            op.totalPaid,
            op.balance,
          ]),
        }

        break
      }

      case "commissions": {
        // Build query for commissions
        let query = supabase
          .from("commission_records")
          .select(
            `
            amount,
            percentage,
            status,
            date_calculated,
            seller_id,
            sellers:seller_id(id, name),
            operation_id,
            operations:operation_id(file_code, agency_id)
          `
          )

        // Apply role-based filtering
        if (user.role === "SELLER") {
          query = query.eq("seller_id", user.id)
        } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
          // Filter by agency through operations
          const { data: agencyOperations } = await supabase
            .from("operations")
            .select("id")
            .in("agency_id", agencyIds)

          const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)
          if (agencyOperationIds.length > 0) {
            query = query.in("operation_id", agencyOperationIds)
          } else {
            return NextResponse.json({ error: "No hay datos" }, { status: 404 })
          }
        }

        // Apply filters
        if (dateFrom) {
          query = query.gte("created_at", dateFrom)
        }
        if (dateTo) {
          query = query.lte("created_at", dateTo)
        }
        if (agencyId && agencyId !== "ALL") {
          const { data: agencyOperations } = await supabase
            .from("operations")
            .select("id")
            .eq("agency_id", agencyId)

          const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)
          if (agencyOperationIds.length > 0) {
            query = query.in("operation_id", agencyOperationIds)
          } else {
            return NextResponse.json({ error: "No hay datos" }, { status: 404 })
          }
        }
        if (effectiveSellerId) {
          query = query.eq("seller_id", effectiveSellerId)
        }

        const { data: commissions } = await query

        // Prepare data
        reportData = {
          headers: ["Vendedor", "Operación", "Monto", "%", "Estado", "Fecha"],
          rows: (commissions || []).map((record: any) => [
            record.sellers?.name || "-",
            record.operations?.file_code || "-",
            record.amount || 0,
            record.percentage || 0,
            record.status,
            record.date_calculated || record.created_at,
          ]),
        }

        break
      }

      default:
        return NextResponse.json({ error: "Tipo de reporte inválido" }, { status: 400 })
    }

    // Generate file based on format
    const timestamp = Date.now()
    const filename = `reporte-${reportType}-${timestamp}`

    if (format === "csv") {
      const csvContent = [reportData.headers, ...reportData.rows]
        .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
        .join("\n")

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
        },
      })
    } else if (format === "excel") {
      // Create Excel workbook
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([reportData.headers, ...reportData.rows])
      XLSX.utils.book_append_sheet(wb, ws, "Reporte")

      // Generate buffer
      const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

      return new NextResponse(excelBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        },
      })
    } else if (format === "pdf") {
      // Create PDF
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 14
      const startY = 20
      let currentY = startY

      // Title
      doc.setFontSize(16)
      doc.text(`Reporte de ${reportType}`, margin, currentY)
      currentY += 10

      // Date range
      if (dateFrom || dateTo) {
        doc.setFontSize(10)
        const dateRange = `${dateFrom || "Inicio"} - ${dateTo || "Fin"}`
        doc.text(`Período: ${dateRange}`, margin, currentY)
        currentY += 8
      }

      // Table
      doc.setFontSize(9)
      const colWidths = reportData.headers.map(() => (pageWidth - 2 * margin) / reportData.headers.length)
      const rowHeight = 7

      // Header row
      doc.setFillColor(200, 200, 200)
      doc.rect(margin, currentY, pageWidth - 2 * margin, rowHeight, "F")
      doc.setTextColor(0, 0, 0)
      reportData.headers.forEach((header, colIndex) => {
        doc.text(header, margin + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0) + 2, currentY + 5)
      })
      currentY += rowHeight

      // Data rows
      doc.setTextColor(0, 0, 0)
      reportData.rows.forEach((row) => {
        if (currentY + rowHeight > pageHeight - margin) {
          doc.addPage()
          currentY = startY
        }

        row.forEach((cell, colIndex) => {
          const cellValue = String(cell || "")
          const x = margin + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0) + 2
          doc.text(cellValue.substring(0, 20), x, currentY + 5) // Truncate long values
        })
        currentY += rowHeight
      })

      const pdfBuffer = Buffer.from(doc.output("arraybuffer"))

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        },
      })
    } else {
      return NextResponse.json({ error: `Formato ${format} no soportado` }, { status: 400 })
    }
  } catch (error) {
    console.error("Error in GET /api/reports/export:", error)
    return NextResponse.json({ error: "Error al exportar reporte" }, { status: 500 })
  }
}
