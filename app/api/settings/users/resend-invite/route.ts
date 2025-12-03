import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  try {
    const { user: currentUser } = await getCurrentUser()
    
    // Solo SUPER_ADMIN y ADMIN pueden reenviar invitaciones
    if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "Falta el ID del usuario" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Obtener datos del usuario
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, auth_id, name, email, role")
      .eq("id", userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // Crear cliente admin de Supabase para enviar invitación
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // Reenviar invitación usando el método inviteUserByEmail
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      (user as any).email,
      {
        redirectTo: `${origin}/auth/accept-invite`,
        data: {
          name: (user as any).name,
          role: (user as any).role,
          invited_by: currentUser.email,
        },
      }
    )

    if (inviteError) {
      console.error("❌ Error resending invite:", inviteError)
      return NextResponse.json(
        { error: inviteError.message || "Error al reenviar invitación" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Invitación reenviada a ${(user as any).email}`,
    })
  } catch (error: any) {
    console.error("❌ Error in POST /api/settings/users/resend-invite:", error)
    return NextResponse.json(
      { error: error.message || "Error al reenviar invitación" },
      { status: 500 }
    )
  }
}

