import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

/**
 * DELETE /api/settings/users/[id]
 * Elimina un usuario (solo SUPER_ADMIN)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { id: userId } = await params

    if (!userId) {
      return NextResponse.json({ error: "ID de usuario requerido" }, { status: 400 })
    }

    // No permitir eliminar a sí mismo
    if (userId === user.id) {
      return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Obtener el usuario para verificar su rol y auth_id
    const { data: userToDelete, error: fetchError } = await supabase
      .from("users")
      .select("id, auth_id, role, email")
      .eq("id", userId)
      .single()

    if (fetchError || !userToDelete) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // No permitir eliminar SUPER_ADMIN
    if ((userToDelete as any).role === "SUPER_ADMIN") {
      return NextResponse.json({ error: "No se puede eliminar un usuario SUPER_ADMIN" }, { status: 400 })
    }

    // Eliminar relaciones primero (user_agencies)
    const { error: agenciesError } = await supabase
      .from("user_agencies")
      .delete()
      .eq("user_id", userId)

    if (agenciesError) {
      console.error("Error deleting user agencies:", agenciesError)
      // Continuar de todas formas
    }

    // Eliminar el usuario de la tabla users
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", userId)

    if (deleteError) {
      console.error("Error deleting user:", deleteError)
      return NextResponse.json({ error: "Error al eliminar usuario" }, { status: 500 })
    }

    // Eliminar el usuario de Supabase Auth usando service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceRoleKey && (userToDelete as any).auth_id) {
      try {
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        })

        const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(
          (userToDelete as any).auth_id
        )

        if (authDeleteError) {
          console.error("Error deleting auth user:", authDeleteError)
          // El usuario ya fue eliminado de la tabla, así que continuamos
        }
      } catch (authError) {
        console.error("Error in auth deletion:", authError)
        // Continuar de todas formas
      }
    }

    return NextResponse.json({ success: true, message: "Usuario eliminado correctamente" })
  } catch (error: any) {
    console.error("Error in delete user:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar usuario" }, { status: 500 })
  }
}

