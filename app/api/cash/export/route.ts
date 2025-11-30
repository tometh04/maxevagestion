import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

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
    const type = searchParams.get("type")
    const currency = searchParams.get("currency")
    const agencyId = searchParams.get("agencyId")

    let query = supabase
      .from("cash_movements")
      .select(
        `
        *,
        users:user_id (
          name
        ),
        operations:operation_id (
          id,
          destination,
          agency_id,
          agencies:agency_id (
            name
          )
        )
      `,
      )
      .order("movement_date", { ascending: false })

    if (user.role === "SELLER") {
      query = query.eq("user_id", user.id)
    }

    if (type && type !== "ALL") {
      query = query.eq("type", type)
    }

    if (currency && currency !== "ALL") {
      query = query.eq("currency", currency)
    }

    if (agencyId && agencyId !== "ALL") {
      // Filter by agency through operations
      const { data: agencyOperations } = await supabase
        .from("operations")
        .select("id")
        .eq("agency_id", agencyId)
      
      const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)
      
      if (agencyOperationIds.length > 0) {
        query = query.in("operation_id", agencyOperationIds)
      } else {
        // No operations for this agency, return empty CSV
        const csvContent = "Fecha,Tipo,Categoría,Monto,Moneda,Agencia,Operación,Usuario,Notas\n"
        return new NextResponse(csvContent, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="cash-movements-${Date.now()}.csv"`,
          },
        })
      }
    }

    if (dateFrom) {
      query = query.gte("movement_date", dateFrom)
    }

    if (dateTo) {
      query = query.lte("movement_date", dateTo)
    }

    const { data: movements, error } = await query

    if (error) {
      console.error("Error exporting movements:", error)
      return NextResponse.json({ error: "Error al exportar movimientos" }, { status: 500 })
    }

    const header = [
      "Fecha",
      "Tipo",
      "Categoría",
      "Monto",
      "Moneda",
      "Agencia",
      "Operación",
      "Usuario",
      "Notas",
    ]

    const rows = (movements || []).map((movement: any) => [
      movement.movement_date,
      movement.type,
      movement.category,
      movement.amount,
      movement.currency,
      movement.operations?.agencies?.name || "",
      movement.operations?.destination || "",
      movement.users?.name || "",
      movement.notes || "",
    ])

    const csvContent = [header, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
      .join("\n")

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="cash-movements-${Date.now()}.csv"`,
      },
    })
  } catch (error) {
    console.error("Error in GET /api/cash/export:", error)
    return NextResponse.json({ error: "Error al exportar movimientos" }, { status: 500 })
  }
}
