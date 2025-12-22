import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

/**
 * POST /api/settings/users/[id]/change-password
 * Cambia la contraseña de un usuario (solo SUPER_ADMIN o ADMIN)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { id: userId } = await params
    const body = await request.json()
    const { password } = body

    if (!userId) {
      return NextResponse.json({ error: "ID de usuario requerido" }, { status: 400 })
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 })
    }

    // Validar fortaleza de contraseña
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumbers = /\d/.test(password)

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      return NextResponse.json({ 
        error: "La contraseña debe contener mayúsculas, minúsculas y números" 
      }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Verificar que el usuario existe
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, auth_id, role, email, name")
      .eq("id", userId)
      .single()

    if (fetchError || !existingUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // No permitir cambiar la contraseña de un SUPER_ADMIN si no eres SUPER_ADMIN
    if ((existingUser as any).role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No puedes modificar la contraseña de un usuario SUPER_ADMIN" }, { status: 403 })
    }

    // Crear cliente admin de Supabase para cambiar contraseña
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

    // Cambiar contraseña usando admin client
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      (existingUser as any).auth_id,
      {
        password: password,
      }
    )

    if (updateError) {
      console.error("Error updating password:", updateError)
      return NextResponse.json({ 
        error: updateError.message || "Error al cambiar la contraseña" 
      }, { status: 500 })
    }

    // Log de auditoría
    try {
      await (supabase.from("audit_logs") as any).insert({
        user_id: user.id,
        action: "CHANGE_USER_PASSWORD",
        entity_type: "user",
        entity_id: userId,
        details: { 
          target_user_email: (existingUser as any).email,
          target_user_name: (existingUser as any).name,
        },
      })
    } catch (e) {
      // No fallar si no existe la tabla
    }

    return NextResponse.json({ 
      success: true, 
      message: "Contraseña actualizada correctamente" 
    })
  } catch (error: any) {
    console.error("Error in change password:", error)
    return NextResponse.json({ error: error.message || "Error al cambiar la contraseña" }, { status: 500 })
  }
}

