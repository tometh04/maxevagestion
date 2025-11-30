import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

interface CashMovementRow {
  date: string
  type: string
  amount: string
  currency: string
  account_name?: string
  category?: string
  notes?: string
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tienes permiso para importar datos" }, { status: 403 })
    }

    const { rows } = await request.json() as { rows: CashMovementRow[] }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No hay datos para importar" }, { status: 400 })
    }

    const supabase = await createServerClient()
    
    // Cache de cuentas financieras
    const { data: accounts } = await supabase.from("financial_accounts").select("id, name, currency")
    const accountMap = new Map((accounts || []).map((a: any) => [a.name?.toLowerCase(), a]))

    let success = 0
    let errors = 0
    let warnings = 0
    const details: string[] = []

    for (const row of rows) {
      try {
        const type = row.type?.toUpperCase()
        if (!["INCOME", "EXPENSE"].includes(type)) {
          errors++
          details.push(`Tipo inválido: ${row.type}`)
          continue
        }

        const currency = row.currency?.toUpperCase() || "ARS"
        
        // Buscar cuenta financiera
        let accountId = null
        if (row.account_name) {
          const account = accountMap.get(row.account_name.toLowerCase())
          if (account) {
            accountId = (account as any).id
            // Verificar que la moneda coincida
            if ((account as any).currency !== currency) {
              warnings++
              details.push(`⚠️ Moneda de cuenta (${(account as any).currency}) no coincide con movimiento (${currency})`)
            }
          } else {
            warnings++
            details.push(`⚠️ Cuenta no encontrada: ${row.account_name}`)
          }
        }

        const { error } = await (supabase.from("cash_movements") as any)
          .insert({
            user_id: user.id,
            type: type,
            amount: parseFloat(row.amount),
            currency: currency,
            movement_date: row.date,
            category: row.category || (type === "INCOME" ? "SALE" : "OTHER"),
            notes: row.notes || null,
            // cash_box_id si existe
          })

        if (error) {
          errors++
          details.push(`Error creando movimiento: ${error.message}`)
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
    console.error("Error in import cash_movements:", error)
    return NextResponse.json({ error: error.message || "Error al importar" }, { status: 500 })
  }
}

