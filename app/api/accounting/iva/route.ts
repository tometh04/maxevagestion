import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getMonthlyIVAToPay } from "@/lib/accounting/iva"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const operationId = searchParams.get("operationId")
    const type = searchParams.get("type") // "purchases" para compras

    // Si viene operationId, filtrar solo por esa operación
    if (operationId) {
      if (type === "purchases") {
        const { data: purchasesIVA, error } = await (supabase.from("iva_purchases") as any)
          .select("*")
          .eq("operation_id", operationId)

        if (error) {
          console.error("Error fetching purchases IVA for operation:", error)
        }

        return NextResponse.json({
          purchases: purchasesIVA || [],
        })
      } else {
        const { data: salesIVA, error } = await (supabase.from("iva_sales") as any)
          .select("*")
          .eq("operation_id", operationId)

        if (error) {
          console.error("Error fetching sales IVA for operation:", error)
        }

        return NextResponse.json({
          sales: salesIVA || [],
        })
      }
    }

    // Si no viene operationId, devolver resumen mensual
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())

    // Get monthly IVA summary
    const ivaSummary = await getMonthlyIVAToPay(supabase, year, month)

    // Get detailed IVA sales
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const endDate = `${year}-${String(month).padStart(2, "0")}-31`

    const { data: salesIVA, error: salesError } = await (supabase.from("iva_sales") as any)
      .select(
        `
        *,
        operations:operation_id (id, destination, file_code, sale_amount_total)
      `
      )
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("sale_date", { ascending: false })

    if (salesError) {
      console.error("Error fetching sales IVA:", salesError)
    }

    // Get detailed IVA purchases
    const { data: purchasesIVA, error: purchasesError } = await (supabase.from("iva_purchases") as any)
      .select(
        `
        *,
        operations:operation_id (id, destination, file_code, operator_cost),
        operators:operator_id (id, name)
      `
      )
      .gte("purchase_date", startDate)
      .lte("purchase_date", endDate)
      .order("purchase_date", { ascending: false })

    if (purchasesError) {
      console.error("Error fetching purchases IVA:", purchasesError)
    }

    return NextResponse.json({
      summary: ivaSummary,
      sales: salesIVA || [],
      purchases: purchasesIVA || [],
      period: { year, month },
    })
  } catch (error) {
    console.error("Error in GET /api/accounting/iva:", error)
    return NextResponse.json({ error: "Error al obtener información de IVA" }, { status: 500 })
  }
}

