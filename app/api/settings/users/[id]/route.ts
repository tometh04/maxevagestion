import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

/**
 * PATCH /api/settings/users/[id]
 * Actualiza un usuario (solo SUPER_ADMIN o ADMIN)
 */
export async function PATCH(
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

    if (!userId) {
      return NextResponse.json({ error: "ID de usuario requerido" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Campos permitidos para actualizar
    const allowedFields = ["is_active", "role", "name", "default_commission_percentage"]
    const updateData: Record<string, any> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 })
    }

    // Verificar que el usuario existe
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .single()

    if (fetchError || !existingUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // No permitir cambiar el rol de un SUPER_ADMIN si no eres SUPER_ADMIN
    if ((existingUser as any).role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No puedes modificar un usuario SUPER_ADMIN" }, { status: 403 })
    }

    // Actualizar usuario
    const usersTable = supabase.from("users") as any
    const { data: updatedUser, error: updateError } = await usersTable
      .update(updateData)
      .eq("id", userId)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating user:", updateError)
      return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 })
    }

    // Log de auditoría
    try {
      await (supabase.from("audit_logs") as any).insert({
        user_id: user.id,
        action: "UPDATE_USER",
        entity_type: "user",
        entity_id: userId,
        details: { changes: updateData },
      })
    } catch (e) {
      // No fallar si no existe la tabla
    }

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error: any) {
    console.error("Error in update user:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar usuario" }, { status: 500 })
  }
}

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

