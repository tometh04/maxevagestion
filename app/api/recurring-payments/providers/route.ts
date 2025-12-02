import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET - Obtener lista de proveedores
export async function GET() {
  try {
    await getCurrentUser() // Solo verificar autenticación
    const supabase = await createServerClient()

    // Obtener todos los proveedores (sin filtro por agencia)
    const { data, error } = await (supabase.from("recurring_payment_providers") as any)
      .select("name")
      .order("name")

    if (error) {
      // Si la tabla no existe, devolver array vacío
      console.error("Error fetching providers:", error)
      return NextResponse.json({ providers: [] })
    }

    const providers = (data || []).map((p: any) => p.name)
    return NextResponse.json({ providers })
  } catch (error: any) {
    console.error("Error fetching providers:", error)
    return NextResponse.json({ providers: [] })
  }
}

// POST - Crear nuevo proveedor
export async function POST(request: Request) {
  let providerName = ""
  
  try {
    await getCurrentUser() // Solo verificar autenticación
    const supabase = await createServerClient()
    const body = await request.json()
    providerName = body?.name || ""

    if (!providerName || providerName.length < 3) {
      return NextResponse.json(
        { error: "El nombre del proveedor debe tener al menos 3 caracteres" },
        { status: 400 }
      )
    }

    // Intentar insertar - si la tabla no existe, no importa
    try {
      await (supabase.from("recurring_payment_providers") as any)
        .upsert({ name: providerName }, { onConflict: "name" })
    } catch (e) {
      // Ignorar errores - el proveedor se usará igual
      console.log("Provider table may not exist, continuing anyway")
    }

    // Siempre devolver éxito - el proveedor se usa directamente en recurring_payments
    return NextResponse.json({ success: true, provider: providerName })
  } catch (error: any) {
    console.error("Error creating provider:", error)
    // Devolver éxito de todos modos - el nombre se usará directamente
    return NextResponse.json({ success: true, provider: providerName })
  }
}
