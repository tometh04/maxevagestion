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
    const weekStart = searchParams.get("weekStart")
    const weekEnd = searchParams.get("weekEnd")
    const includeUndated = searchParams.get("includeUndated") === "true"
    const page = parseInt(searchParams.get("page") || "1")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const offset = (page - 1) * limit

    // Helper para construir base query con role filtering
    const buildBaseQuery = () => {
      let q = (supabase
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
      return q
    }

    const applyRoleFilter = async (q: any) => {
      const role = user.role as string
      if (role === "SELLER" || role === "CONTABLE" || role === "VIEWER") {
        q = q.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
      } else if (role === "ADMIN") {
        const userAgencies = await getUserAgencies(user.id)
        const agencyIds = userAgencies.map((ua) => ua.agency_id)
        if (agencyIds.length > 0) {
          q = q.in("agency_id", agencyIds)
        }
      }
      return q
    }

    const applyStatusFilter = (q: any) => {
      if (status && status !== "ALL") {
        if (status === "ACTIVE") {
          q = q.in("status", ["PENDING", "IN_PROGRESS"])
        } else {
          q = q.eq("status", status)
        }
      }
      return q
    }

    const applyCommonFilters = (q: any) => {
      if (priority && priority !== "ALL") {
        q = q.eq("priority", priority)
      }
      if (assignedTo && assignedTo !== "ALL") {
        q = q.eq("assigned_to", assignedTo)
      }
      if (operationId) {
        q = q.eq("operation_id", operationId)
      }
      return q
    }

    // Si hay filtro semanal, hacer 2 queries: tareas con fecha en rango + tareas sin fecha
    if (weekStart && weekEnd) {
      // Query 1: Tareas con due_date en el rango de la semana
      let datedQuery = buildBaseQuery()
      datedQuery = await applyRoleFilter(datedQuery)
      datedQuery = applyStatusFilter(datedQuery)
      datedQuery = applyCommonFilters(datedQuery)
      datedQuery = datedQuery
        .gte("due_date", weekStart)
        .lte("due_date", weekEnd)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false })
        .range(0, limit - 1)

      const { data: datedTasks, error: datedError } = await datedQuery

      if (datedError) {
        console.error("Error fetching dated tasks:", datedError)
        return NextResponse.json({ error: "Error al obtener tareas", detail: datedError.message, code: datedError.code }, { status: 500 })
      }

      let allTasks = datedTasks || []

      // Query 2: Tareas sin fecha (si includeUndated)
      if (includeUndated) {
        let undatedQuery = buildBaseQuery()
        undatedQuery = await applyRoleFilter(undatedQuery)
        undatedQuery = applyStatusFilter(undatedQuery)
        undatedQuery = applyCommonFilters(undatedQuery)
        undatedQuery = undatedQuery
          .is("due_date", null)
          .order("created_at", { ascending: false })
          .range(0, 50)

        const { data: undatedTasks } = await undatedQuery
        if (undatedTasks) {
          allTasks = [...allTasks, ...undatedTasks]
        }
      }

      return NextResponse.json({
        data: allTasks,
        pagination: {
          page: 1,
          limit,
          total: allTasks.length,
          totalPages: 1,
        },
      })
    }

    // Sin filtro semanal: query normal con paginación
    let query = buildBaseQuery()
    query = await applyRoleFilter(query)
    query = applyStatusFilter(query)
    query = applyCommonFilters(query)

    query = query
      .order("status", { ascending: true })
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
  } catch (error: any) {
    console.error("Error in GET /api/tasks:", error)
    return NextResponse.json({ error: "Error al obtener tareas", detail: error?.message || String(error) }, { status: 500 })
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
