import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

interface OperatorRow {
  name: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  credit_limit?: string
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tienes permiso para importar datos" }, { status: 403 })
    }

    const { rows } = await request.json() as { rows: OperatorRow[] }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No hay datos para importar" }, { status: 400 })
    }

    const supabase = await createServerClient()
    
    let success = 0
    let errors = 0
    let warnings = 0
    const details: string[] = []

    for (const row of rows) {
      try {
        // Buscar si ya existe por nombre
        const { data: existingOperator } = await supabase
          .from("operators")
          .select("id")
          .ilike("name", row.name)
          .maybeSingle()

        if (existingOperator) {
          // Actualizar operador existente
          const { error } = await (supabase.from("operators") as any)
            .update({
              name: row.name,
              contact_name: row.contact_name || null,
              contact_email: row.contact_email || null,
              contact_phone: row.contact_phone || null,
              credit_limit: row.credit_limit ? parseFloat(row.credit_limit) : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", (existingOperator as any).id)

          if (error) {
            errors++
            details.push(`Error actualizando ${row.name}: ${error.message}`)
          } else {
            warnings++
            details.push(`Actualizado: ${row.name}`)
          }
        } else {
          // Crear nuevo operador
          const { error } = await (supabase.from("operators") as any)
            .insert({
              name: row.name,
              contact_name: row.contact_name || null,
              contact_email: row.contact_email || null,
              contact_phone: row.contact_phone || null,
              credit_limit: row.credit_limit ? parseFloat(row.credit_limit) : null,
            })

          if (error) {
            errors++
            details.push(`Error creando ${row.name}: ${error.message}`)
          } else {
            success++
          }
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
      details: details.slice(0, 20),
    })
  } catch (error: any) {
    console.error("Error in import operators:", error)
    return NextResponse.json({ error: error.message || "Error al importar" }, { status: 500 })
  }
}

