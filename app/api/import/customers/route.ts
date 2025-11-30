import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

interface CustomerRow {
  first_name: string
  last_name: string
  phone: string
  email?: string
  document_type?: string
  document_number?: string
  date_of_birth?: string
  nationality?: string
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tienes permiso para importar datos" }, { status: 403 })
    }

    const { rows } = await request.json() as { rows: CustomerRow[] }

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
        // Buscar si ya existe por documento o email
        let existingCustomer = null
        
        if (row.document_number) {
          const { data } = await supabase
            .from("customers")
            .select("id")
            .eq("document_number", row.document_number)
            .maybeSingle()
          existingCustomer = data
        }
        
        if (!existingCustomer && row.email) {
          const { data } = await supabase
            .from("customers")
            .select("id")
            .eq("email", row.email)
            .maybeSingle()
          existingCustomer = data
        }

        if (existingCustomer) {
          // Actualizar cliente existente
          const { error } = await (supabase.from("customers") as any)
            .update({
              first_name: row.first_name,
              last_name: row.last_name,
              phone: row.phone,
              email: row.email || null,
              document_type: row.document_type || null,
              document_number: row.document_number || null,
              date_of_birth: row.date_of_birth || null,
              nationality: row.nationality || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", (existingCustomer as any).id)

          if (error) {
            errors++
            details.push(`Error actualizando ${row.first_name} ${row.last_name}: ${error.message}`)
          } else {
            warnings++ // Actualización cuenta como warning
            details.push(`Actualizado: ${row.first_name} ${row.last_name}`)
          }
        } else {
          // Crear nuevo cliente
          const { error } = await (supabase.from("customers") as any)
            .insert({
              first_name: row.first_name,
              last_name: row.last_name,
              phone: row.phone,
              email: row.email || null,
              document_type: row.document_type || null,
              document_number: row.document_number || null,
              date_of_birth: row.date_of_birth || null,
              nationality: row.nationality || null,
            })

          if (error) {
            errors++
            details.push(`Error creando ${row.first_name} ${row.last_name}: ${error.message}`)
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
      details: details.slice(0, 20), // Limitar detalles
    })
  } catch (error: any) {
    console.error("Error in import customers:", error)
    return NextResponse.json({ error: error.message || "Error al importar" }, { status: 500 })
  }
}

