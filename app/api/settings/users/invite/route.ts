import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { name, email, role, agencies, default_commission_percentage } = body

    // Validar campos requeridos
    if (!name || !email || !role) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Verificar si el email ya existe
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({ error: "El email ya está registrado" }, { status: 400 })
    }

    // Crear usuario en Supabase Auth usando service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ Missing Supabase credentials for admin operations")
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: "temp-password-123", // User should reset on first login
      email_confirm: true,
    })

    if (authError || !authData.user) {
      console.error("❌ Error creating auth user:", authError)
      return NextResponse.json({ 
        error: authError?.message || "Error al crear usuario en el sistema de autenticación" 
      }, { status: 400 })
    }

    // Create user record
    const usersTable = supabase.from("users") as any
    const userInsertData: any = {
      auth_id: authData.user.id,
      name,
      email,
      role,
      is_active: true,
    }

    // Si es vendedor y se especificó comisión, agregarla
    if (role === "SELLER" && default_commission_percentage !== undefined && default_commission_percentage !== null) {
      userInsertData.default_commission_percentage = default_commission_percentage
    }

    const { data: userData, error: userError } = await usersTable
      .insert(userInsertData)
      .select()
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: "Error al crear registro de usuario" }, { status: 400 })
    }

    // Link agencies
    if (agencies && agencies.length > 0) {
      const userAgenciesTable = supabase.from("user_agencies") as any
      const { error: agenciesError } = await userAgenciesTable.insert(
        agencies.map((agencyId: string) => ({
          user_id: (userData as any).id,
          agency_id: agencyId,
        }))
      )

      if (agenciesError) {
        console.error("❌ Error linking agencies:", agenciesError)
        // No fallar si solo falla el link de agencias, el usuario ya está creado
      }
    }

    return NextResponse.json({ success: true, user: userData })
  } catch (error: any) {
    console.error("❌ Error in invite user:", error)
    return NextResponse.json({ 
      error: error.message || "Error al invitar usuario" 
    }, { status: 500 })
  }
}

