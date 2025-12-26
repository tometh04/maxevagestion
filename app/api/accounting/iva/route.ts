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
    const agencyId = searchParams.get("agencyId")

    // Get monthly IVA summary
    const ivaSummary = await getMonthlyIVAToPay(supabase, year, month)

    // Get detailed IVA sales
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const endDate = `${year}-${String(month).padStart(2, "0")}-31`

    let salesQuery = (supabase.from("iva_sales") as any)
      .select(
        `
        *,
        operations:operation_id (id, destination, file_code, sale_amount_total, agency_id)
      `
      )
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("sale_date", { ascending: false })

    const { data: salesIVA, error: salesError } = await salesQuery

    if (salesError) {
      console.error("Error fetching sales IVA:", salesError)
    }

    // Get detailed IVA purchases
    let purchasesQuery = (supabase.from("iva_purchases") as any)
      .select(
        `
        *,
        operations:operation_id (id, destination, file_code, operator_cost, agency_id),
        operators:operator_id (id, name)
      `
      )
      .gte("purchase_date", startDate)
      .lte("purchase_date", endDate)
      .order("purchase_date", { ascending: false })

    const { data: purchasesIVA, error: purchasesError } = await purchasesQuery

    if (purchasesError) {
      console.error("Error fetching purchases IVA:", purchasesError)
    }

    // Filtrar por agencia si se especifica
    let filteredSalesIVA = salesIVA || []
    let filteredPurchasesIVA = purchasesIVA || []
    
    if (agencyId && agencyId !== "ALL") {
      filteredSalesIVA = filteredSalesIVA.filter((s: any) => {
        const operation = s.operations
        return operation && operation.agency_id === agencyId
      })
      
      filteredPurchasesIVA = filteredPurchasesIVA.filter((p: any) => {
        const operation = p.operations
        return operation && operation.agency_id === agencyId
      })
    }

    return NextResponse.json({
      summary: ivaSummary,
      sales: filteredSalesIVA,
      purchases: filteredPurchasesIVA,
      period: { year, month },
    })
  } catch (error) {
    console.error("Error in GET /api/accounting/iva:", error)
    return NextResponse.json({ error: "Error al obtener información de IVA" }, { status: 500 })
  }
}

