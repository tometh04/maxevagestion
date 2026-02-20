import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params

    const { data: task, error } = await (supabase
      .from("tasks" as any)
      .select(
        `
        *,
        creator:created_by(id, name, email),
        assignee:assigned_to(id, name, email),
        operations:operation_id(id, destination, file_code),
        customers:customer_id(id, first_name, last_name)
      `
      )
      .eq("id", id)
      .single() as any)

    if (error || !task) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 })
    }

    // Permission check: only creator, assignee, or admin can view
    const canView =
      task.created_by === user.id ||
      task.assigned_to === user.id ||
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN"

    if (!canView) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error("Error in GET /api/tasks/[id]:", error)
    return NextResponse.json({ error: "Error al obtener tarea" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params
    const body = await request.json()

    // Fetch existing task
    const { data: existing, error: fetchError } = await (supabase
      .from("tasks" as any)
      .select("*")
      .eq("id", id)
      .single() as any)

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 })
    }

    // Permission check
    const canEdit =
      existing.created_by === user.id ||
      existing.assigned_to === user.id ||
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN"

    if (!canEdit) {
      return NextResponse.json({ error: "Sin permisos para editar" }, { status: 403 })
    }

    // Build update object (only allowed fields)
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.title !== undefined) updates.title = body.title.trim()
    if (body.description !== undefined) updates.description = body.description?.trim() || null
    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === "DONE") {
        updates.completed_at = new Date().toISOString()
      } else {
        updates.completed_at = null
      }
    }
    if (body.priority !== undefined) updates.priority = body.priority
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to
    if (body.due_date !== undefined) updates.due_date = body.due_date || null
    if (body.reminder_minutes !== undefined) {
      updates.reminder_minutes = body.reminder_minutes || null
      updates.reminder_sent = false // Reset reminder when changed
    }
    if (body.operation_id !== undefined) updates.operation_id = body.operation_id || null
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id || null

    const { data: task, error } = await (supabase
      .from("tasks" as any) as any)
      .update(updates)
      .eq("id", id)
      .select(
        `
        *,
        creator:created_by(id, name, email),
        assignee:assigned_to(id, name, email),
        operations:operation_id(id, destination, file_code),
        customers:customer_id(id, first_name, last_name)
      `
      )
      .single()

    if (error) {
      console.error("Error updating task:", error)
      return NextResponse.json({ error: "Error al actualizar tarea" }, { status: 500 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error("Error in PATCH /api/tasks/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar tarea" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params

    // Fetch existing task
    const { data: existing, error: fetchError } = await (supabase
      .from("tasks" as any)
      .select("created_by")
      .eq("id", id)
      .single() as any)

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 })
    }

    // Only creator or admin can delete
    const canDelete =
      existing.created_by === user.id ||
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN"

    if (!canDelete) {
      return NextResponse.json({ error: "Sin permisos para eliminar" }, { status: 403 })
    }

    const { error } = await (supabase.from("tasks" as any) as any).delete().eq("id", id)

    if (error) {
      console.error("Error deleting task:", error)
      return NextResponse.json({ error: "Error al eliminar tarea" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/tasks/[id]:", error)
    return NextResponse.json({ error: "Error al eliminar tarea" }, { status: 500 })
  }
}
