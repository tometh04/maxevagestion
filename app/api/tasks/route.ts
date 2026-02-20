import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser, getUserAgencies } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const assignedTo = searchParams.get("assignedTo")
    const operationId = searchParams.get("operationId")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const offset = (page - 1) * limit

    // Build query
    let query = (supabase
      .from("tasks" as any) as any)
      .select(
        `
        *,
        creator:created_by(id, name, email),
        assignee:assigned_to(id, name, email),
        operations:operation_id(id, destination, file_code),
        customers:customer_id(id, first_name, last_name)
      `,
        { count: "exact" }
      )

    // Role-based filtering
    const role = user.role as string
    if (role === "SELLER" || role === "CONTABLE" || role === "VIEWER") {
      // Solo ven tareas donde son asignados o creadores
      query = query.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
    } else if (role === "ADMIN") {
      // ADMIN ve tareas de sus agencias
      const userAgencies = await getUserAgencies(user.id)
      const agencyIds = userAgencies.map((ua) => ua.agency_id)
      if (agencyIds.length > 0) {
        query = query.in("agency_id", agencyIds)
      }
    }
    // SUPER_ADMIN ve todo — no filtra

    // Apply filters
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    if (priority && priority !== "ALL") {
      query = query.eq("priority", priority)
    }

    if (assignedTo && assignedTo !== "ALL") {
      query = query.eq("assigned_to", assignedTo)
    }

    if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    // Orden: URGENT primero, luego por due_date ASC, luego por created_at DESC
    query = query
      .order("status", { ascending: true }) // PENDING, IN_PROGRESS antes que DONE
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: tasks, error, count } = await query

    if (error) {
      console.error("Error fetching tasks:", error)
      return NextResponse.json({ error: "Error al obtener tareas" }, { status: 500 })
    }

    return NextResponse.json({
      data: tasks || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error("Error in GET /api/tasks:", error)
    return NextResponse.json({ error: "Error al obtener tareas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { title, description, priority, assigned_to, due_date, reminder_minutes, operation_id, customer_id, agency_id } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: "El título es requerido" }, { status: 400 })
    }

    if (!assigned_to) {
      return NextResponse.json({ error: "Debe asignar la tarea a un usuario" }, { status: 400 })
    }

    if (!agency_id) {
      return NextResponse.json({ error: "La agencia es requerida" }, { status: 400 })
    }

    const taskData = {
      title: title.trim(),
      description: description?.trim() || null,
      status: "PENDING" as const,
      priority: priority || "MEDIUM",
      created_by: user.id,
      assigned_to,
      due_date: due_date || null,
      reminder_minutes: due_date && reminder_minutes ? reminder_minutes : null,
      reminder_sent: false,
      operation_id: operation_id || null,
      customer_id: customer_id || null,
      agency_id,
    }

    const { data: task, error } = await (supabase
      .from("tasks" as any) as any)
      .insert(taskData)
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
      console.error("Error creating task:", error)
      return NextResponse.json({ error: "Error al crear tarea" }, { status: 500 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error("Error in POST /api/tasks:", error)
    return NextResponse.json({ error: "Error al crear tarea" }, { status: 500 })
  }
}
