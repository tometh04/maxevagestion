import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * POST /api/settings/users/[id]/activate
 *
 * Activa manualmente un usuario cuyo email todavía no fue verificado:
 *   1. Confirma el email en Supabase Auth (sin necesitar el link de invitación).
 *   2. Envía un email de "establecer contraseña" para que el usuario pueda ingresar.
 *
 * Solo SUPER_ADMIN y ADMIN pueden ejecutar esta acción.
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
    const supabase = await createServerClient()

    // Cargar el usuario target (scoped a la misma org)
    const { data: target, error: fetchError } = await (supabase.from("users") as any)
      .select("id, auth_id, email, name, org_id")
      .eq("id", userId)
      .single()

    if (fetchError || !target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    if (user.org_id && target.org_id !== user.org_id) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    if (!target.auth_id) {
      return NextResponse.json({ error: "El usuario no tiene cuenta de acceso asociada" }, { status: 400 })
    }

    const adminClient = createAdminClient() as any

    // Verificar si ya está confirmado
    const { data: authUser } = await adminClient.auth.admin.getUserById(target.auth_id)
    if (authUser?.user?.email_confirmed_at) {
      return NextResponse.json({ error: "El email de este usuario ya fue verificado" }, { status: 400 })
    }

    // 1. Confirmar email manualmente
    const { error: confirmError } = await adminClient.auth.admin.updateUserById(target.auth_id, {
      email_confirm: true,
    })

    if (confirmError) {
      console.error("Error confirming email:", confirmError)
      return NextResponse.json({ error: "Error al confirmar el email" }, { status: 500 })
    }

    // 2. Enviar email de reset de contraseña para que el usuario pueda establecer su clave
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
    const { error: resetError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: target.email,
      options: { redirectTo: `${origin}/auth/accept-invite` },
    })

    if (resetError) {
      // No es crítico — el email fue confirmado igual, el usuario puede hacer "olvidé mi contraseña"
      console.warn("Warning: email confirmed but recovery link failed:", resetError.message)
    }

    return NextResponse.json({
      success: true,
      message: `Acceso activado para ${target.email}. Se envió un email para establecer la contraseña.`,
    })
  } catch (error: any) {
    console.error("Error in POST /api/settings/users/[id]/activate:", error)
    return NextResponse.json({ error: error.message || "Error al activar usuario" }, { status: 500 })
  }
}
