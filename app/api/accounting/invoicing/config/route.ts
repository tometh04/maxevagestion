import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// POST - Guardar configuración AFIP
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN y ADMIN pueden configurar
    if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { cuit, access_token, environment, punto_venta, is_active } = body

    if (!cuit || !access_token) {
      return NextResponse.json(
        { error: "CUIT y Access Token son requeridos" },
        { status: 400 }
      )
    }

    // Verificar si ya existe configuración
    const { data: existing } = await supabase
      .from("afip_config")
      .select("id")
      .maybeSingle()

    if (existing) {
      // Actualizar - no sobreescribir token si viene el valor enmascarado
      const updateData: any = {
        cuit,
        environment: environment || "sandbox",
        punto_venta: punto_venta || 1,
        is_active: is_active || false,
        updated_at: new Date().toISOString(),
      }
      if (access_token !== "********") {
        updateData.access_token = access_token
      }
      const { error } = await supabase
        .from("afip_config")
        .update(updateData)
        .eq("id", existing.id)

      if (error) {
        console.error("Error updating AFIP config:", error)
        return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 })
      }
    } else {
      // Crear
      const { error } = await supabase
        .from("afip_config")
        .insert({
          cuit,
          access_token,
          environment: environment || "sandbox",
          punto_venta: punto_venta || 1,
          is_active: is_active || false,
        })

      if (error) {
        console.error("Error creating AFIP config:", error)
        return NextResponse.json({ error: "Error al crear configuración" }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/invoicing/config:", error)
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 })
  }
}

// GET - Obtener configuración AFIP
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from("afip_config")
      .select("*")
      .maybeSingle()

    if (error) {
      console.error("Error fetching AFIP config:", error)
      return NextResponse.json({ error: "Error al obtener configuración" }, { status: 500 })
    }

    // No devolver el access_token completo por seguridad
    if (data) {
      return NextResponse.json({
        ...data,
        access_token: data.access_token ? "********" : "",
      })
    }

    return NextResponse.json(null)
  } catch (error: any) {
    console.error("Error in GET /api/accounting/invoicing/config:", error)
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 })
  }
}
