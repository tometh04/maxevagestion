import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { name, email, role, agencies, default_commission_percentage } = body

    // Validar campos requeridos
    if (!name || !email || !role) {
      return NextResponse.json({ error: "Faltan campos requeridos: nombre, email y rol son obligatorios" }, { status: 400 })
    }

    // Validar rol
    const validRoles = ["SUPER_ADMIN", "ADMIN", "CONTABLE", "SELLER", "VIEWER"]
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
    }

    // Verificar si el email ya existe
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({ error: "El email ya está registrado en el sistema" }, { status: 400 })
    }

    // Crear cliente admin de Supabase
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

    // Obtener la URL base para el redirect
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // Invitar usuario con Supabase Auth (envía email automáticamente)
    const { data: authData, error: authError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/accept-invite`,
      data: {
        name,
        role,
        invited_by: user.email,
      },
    })

    if (authError || !authData.user) {
      console.error("❌ Error inviting user:", authError)
      
      // Si el error es que el usuario ya existe en auth pero no en nuestra tabla
      if (authError?.message?.includes("already been registered")) {
        return NextResponse.json({ 
          error: "Este email ya está registrado en el sistema de autenticación" 
        }, { status: 400 })
      }
      
      return NextResponse.json({ 
        error: authError?.message || "Error al enviar invitación" 
      }, { status: 400 })
    }

    // Crear registro en nuestra tabla de usuarios
    const usersTable = supabase.from("users") as any
    const userInsertData: any = {
      auth_id: authData.user.id,
      name,
      email,
      role,
      is_active: true,
    }

    // Si es vendedor y se especificó comisión
    if (role === "SELLER" && default_commission_percentage !== undefined && default_commission_percentage !== null) {
      userInsertData.default_commission_percentage = default_commission_percentage
    }

    const { data: userData, error: userError } = await usersTable
      .insert(userInsertData)
      .select()
      .single()

    if (userError || !userData) {
      console.error("❌ Error creating user record:", userError)
      // Si falla crear el registro, eliminar el usuario de auth
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: "Error al crear registro de usuario" }, { status: 400 })
    }

    // Vincular agencias
    if (agencies && agencies.length > 0) {
      const userAgenciesTable = supabase.from("user_agencies") as any
      const { error: agenciesError } = await userAgenciesTable.insert(
        agencies.map((agencyId: string) => ({
          user_id: (userData as any).id,
          agency_id: agencyId,
        }))
      )

      if (agenciesError) {
        console.error("⚠️ Error linking agencies:", agenciesError)
        // No fallar si solo falla el link de agencias
      }
    }

    // Log de auditoría
    try {
      await (supabase.from("audit_logs") as any).insert({
        user_id: user.id,
        action: "INVITE_USER",
        entity_type: "user",
        entity_id: (userData as any).id,
        details: { invited_email: email, role, agencies },
      })
    } catch (e) {
      // No fallar si no existe la tabla de auditoría
    }

    return NextResponse.json({ 
      success: true, 
      user: userData,
      message: `Invitación enviada a ${email}. El usuario recibirá un email para crear su contraseña.`
    })
  } catch (error: any) {
    console.error("❌ Error in invite user:", error)
    return NextResponse.json({ 
      error: error.message || "Error al invitar usuario" 
    }, { status: 500 })
  }
}
