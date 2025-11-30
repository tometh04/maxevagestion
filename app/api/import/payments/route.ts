import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

interface PaymentRow {
  operation_file_code: string
  amount: string
  currency: string
  date_due: string
  date_paid?: string
  status?: string
  direction: string
  payer_type?: string
  method?: string
  reference?: string
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tienes permiso para importar datos" }, { status: 403 })
    }

    const { rows } = await request.json() as { rows: PaymentRow[] }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No hay datos para importar" }, { status: 400 })
    }

    const supabase = await createServerClient()
    
    // Cache de operaciones
    const { data: operations } = await supabase.from("operations").select("id, file_code")
    const operationMap = new Map((operations || []).map((o: any) => [o.file_code, o.id]))

    let success = 0
    let errors = 0
    let warnings = 0
    const details: string[] = []

    for (const row of rows) {
      try {
        const operationId = operationMap.get(row.operation_file_code)
        
        if (!operationId) {
          errors++
          details.push(`Operación no encontrada: ${row.operation_file_code}`)
          continue
        }

        const direction = row.direction?.toUpperCase()
        if (!["INCOME", "EXPENSE"].includes(direction)) {
          errors++
          details.push(`Dirección inválida: ${row.direction}`)
          continue
        }

        const payerType = row.payer_type?.toUpperCase() || (direction === "INCOME" ? "CUSTOMER" : "OPERATOR")
        const status = validatePaymentStatus(row.status, row.date_paid)

        const { error } = await (supabase.from("payments") as any)
          .insert({
            operation_id: operationId,
            amount: parseFloat(row.amount),
            currency: row.currency?.toUpperCase() || "ARS",
            date_due: row.date_due,
            date_paid: row.date_paid || null,
            status: status,
            direction: direction,
            payer_type: payerType,
            method: row.method || "TRANSFER",
            reference: row.reference || null,
          })

        if (error) {
          errors++
          details.push(`Error creando pago para ${row.operation_file_code}: ${error.message}`)
        } else {
          success++
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
    console.error("Error in import payments:", error)
    return NextResponse.json({ error: error.message || "Error al importar" }, { status: 500 })
  }
}

function validatePaymentStatus(status?: string, datePaid?: string): string {
  if (datePaid) return "PAID"
  if (!status) return "PENDING"
  const upper = status.toUpperCase()
  if (["PENDING", "PAID", "OVERDUE"].includes(upper)) return upper
  return "PENDING"
}

