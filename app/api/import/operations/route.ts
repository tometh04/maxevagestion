import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

interface OperationRow {
  file_code?: string
  customer_email?: string
  destination: string
  departure_date: string
  return_date?: string
  adults?: string
  children?: string
  sale_amount: string
  operator_cost: string
  currency?: string
  status?: string
  seller_email?: string
  operator_name?: string
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tienes permiso para importar datos" }, { status: 403 })
    }

    const { rows } = await request.json() as { rows: OperationRow[] }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No hay datos para importar" }, { status: 400 })
    }

    const supabase = await createServerClient()
    
    // Obtener agencia del usuario
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)
      .limit(1)
    
    const agencyId = (userAgencies as any)?.[0]?.agency_id
    if (!agencyId) {
      return NextResponse.json({ error: "Usuario sin agencia asignada" }, { status: 400 })
    }

    // Cache de vendedores y operadores
    const { data: sellers } = await supabase.from("users").select("id, email")
    const { data: operators } = await supabase.from("operators").select("id, name")
    const { data: customers } = await supabase.from("customers").select("id, email")

    const sellerMap = new Map((sellers || []).map((s: any) => [s.email?.toLowerCase(), s.id]))
    const operatorMap = new Map((operators || []).map((o: any) => [o.name?.toLowerCase(), o.id]))
    const customerMap = new Map((customers || []).map((c: any) => [c.email?.toLowerCase(), c.id]))

    let success = 0
    let errors = 0
    let warnings = 0
    const details: string[] = []

    for (const row of rows) {
      try {
        // Buscar IDs relacionados
        const sellerId = row.seller_email ? sellerMap.get(row.seller_email.toLowerCase()) : user.id
        const operatorId = row.operator_name ? operatorMap.get(row.operator_name.toLowerCase()) : null
        const customerId = row.customer_email ? customerMap.get(row.customer_email.toLowerCase()) : null

        // Verificar si ya existe por file_code
        let existingOperation = null
        if (row.file_code) {
          const { data } = await supabase
            .from("operations")
            .select("id")
            .eq("file_code", row.file_code)
            .maybeSingle()
          existingOperation = data
        }

        const saleAmount = parseFloat(row.sale_amount)
        const operatorCost = parseFloat(row.operator_cost)
        const marginAmount = saleAmount - operatorCost
        const marginPercentage = saleAmount > 0 ? (marginAmount / saleAmount) * 100 : 0

        const operationData = {
          agency_id: agencyId,
          seller_id: sellerId || user.id,
          operator_id: operatorId,
          customer_id: customerId,
          type: "PACKAGE" as const,
          product_type: "PAQUETE",
          destination: row.destination,
          departure_date: row.departure_date,
          return_date: row.return_date || null,
          adults: row.adults ? parseInt(row.adults) : 2,
          children: row.children ? parseInt(row.children) : 0,
          infants: 0,
          sale_amount_total: saleAmount,
          sale_currency: (row.currency?.toUpperCase() as "ARS" | "USD") || "ARS",
          operator_cost: operatorCost,
          operator_cost_currency: (row.currency?.toUpperCase() as "ARS" | "USD") || "ARS",
          currency: row.currency?.toUpperCase() || "ARS",
          margin_amount: marginAmount,
          margin_percentage: marginPercentage,
          status: validateStatus(row.status) || "CONFIRMED",
        }

        if (existingOperation) {
          // Actualizar operación existente
          const { error } = await (supabase.from("operations") as any)
            .update({
              ...operationData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", (existingOperation as any).id)

          if (error) {
            errors++
            details.push(`Error actualizando ${row.file_code || row.destination}: ${error.message}`)
          } else {
            warnings++
            details.push(`Actualizado: ${row.file_code || row.destination}`)
          }
        } else {
          // Crear nueva operación
          const fileCode = row.file_code || generateFileCode()
          
          const { error } = await (supabase.from("operations") as any)
            .insert({
              ...operationData,
              file_code: fileCode,
            })

          if (error) {
            errors++
            details.push(`Error creando ${row.destination}: ${error.message}`)
          } else {
            success++
          }
        }

        // Advertencias
        if (!sellerId && row.seller_email) {
          details.push(`⚠️ Vendedor no encontrado: ${row.seller_email}`)
        }
        if (!operatorId && row.operator_name) {
          details.push(`⚠️ Operador no encontrado: ${row.operator_name}`)
        }
      } catch (error: any) {
        errors++
        details.push(`Error procesando fila: ${error.message}`)
      }
    }

    return NextResponse.json({
      success,
      errors,
      warnings,
      details: details.slice(0, 30),
    })
  } catch (error: any) {
    console.error("Error in import operations:", error)
    return NextResponse.json({ error: error.message || "Error al importar" }, { status: 500 })
  }
}

function validateStatus(status?: string): string | null {
  const validStatuses = ["PRE_RESERVATION", "RESERVED", "CONFIRMED", "CANCELLED", "TRAVELLED", "CLOSED"]
  if (!status) return null
  const upper = status.toUpperCase()
  return validStatuses.includes(upper) ? upper : null
}

function generateFileCode(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "")
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `OP-${dateStr}-${random}`
}

