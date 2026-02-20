import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser, getUserAgencies } from "@/lib/auth"

const TASK_SELECT = `
  *,
  creator:created_by(id, name, email),
  assignee:assigned_to(id, name, email),
  operations:operation_id(id, destination, file_code),
  customers:customer_id(id, first_name, last_name)
`

// Construir filtro de rol como string para PostgREST .or()
async function getRoleFilter(user: any): Promise<{ type: "or" | "eq" | "none"; value: string }> {
  const role = String(user.role)
  if (role === "SELLER" || role === "CONTABLE" || role === "VIEWER") {
    return { type: "or", value: `assigned_to.eq.${user.id},created_by.eq.${user.id}` }
  } else if (role === "ADMIN") {
    const userAgencies = await getUserAgencies(user.id)
    const agencyIds = userAgencies.map((ua) => ua.agency_id)
    if (agencyIds.length > 0) {
      const orFilter = agencyIds.map((id) => `agency_id.eq.${id}`).join(",")
      return { type: "or", value: orFilter }
    }
  }
  // SUPER_ADMIN ve todo
  return { type: "none", value: "" }
}

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

    // Pre-calcular filtro de rol
    const roleFilter = await getRoleFilter(user)

    // ========================================
    // Con filtro semanal: 2 queries separadas
    // ========================================
    if (weekStart && weekEnd) {
      // Query 1: Tareas con due_date en el rango
      const datedResult = await buildAndExecuteQuery(supabase, {
        roleFilter,
        status,
        priority,
        assignedTo,
        operationId,
        dateFilter: { type: "range", start: weekStart, end: weekEnd },
        orderBy: [
          { column: "due_date", ascending: true },
          { column: "created_at", ascending: false },
        ],
        rangeStart: 0,
        rangeEnd: limit - 1,
      })

      if (datedResult.error) {
        console.error("Error fetching dated tasks:", datedResult.error)
        return NextResponse.json(
          { error: "Error al obtener tareas", detail: datedResult.error.message },
          { status: 500 }
        )
      }

      let allTasks = datedResult.data || []

      // Query 2: Tareas sin fecha
      if (includeUndated) {
        const undatedResult = await buildAndExecuteQuery(supabase, {
          roleFilter,
          status,
          priority,
          assignedTo,
          operationId,
          dateFilter: { type: "null" },
          orderBy: [{ column: "created_at", ascending: false }],
          rangeStart: 0,
          rangeEnd: 50,
        })

        if (undatedResult.data) {
          allTasks = [...allTasks, ...undatedResult.data]
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

    // ========================================
    // Sin filtro semanal: query con paginación
    // ========================================
    const result = await buildAndExecuteQuery(supabase, {
      roleFilter,
      status,
      priority,
      assignedTo,
      operationId,
      dateFilter: null,
      orderBy: [
        { column: "status", ascending: true },
        { column: "due_date", ascending: true, nullsFirst: false },
        { column: "created_at", ascending: false },
      ],
      rangeStart: offset,
      rangeEnd: offset + limit - 1,
      withCount: true,
    })

    if (result.error) {
      console.error("Error fetching tasks:", result.error)
      return NextResponse.json(
        { error: "Error al obtener tareas", detail: result.error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: result.data || [],
      pagination: {
        page,
        limit,
        total: result.count || 0,
        totalPages: Math.ceil((result.count || 0) / limit),
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/tasks:", error)
    return NextResponse.json(
      { error: "Error al obtener tareas", detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// Función que construye y ejecuta un query completo en una sola cadena
// para evitar romper el query builder de Supabase con reasignaciones
async function buildAndExecuteQuery(
  supabase: any,
  opts: {
    roleFilter: { type: "or" | "eq" | "none"; value: string }
    status: string | null
    priority: string | null
    assignedTo: string | null
    operationId: string | null
    dateFilter: { type: "range"; start: string; end: string } | { type: "null" } | null
    orderBy: { column: string; ascending: boolean; nullsFirst?: boolean }[]
    rangeStart: number
    rangeEnd: number
    withCount?: boolean
  }
) {
  // Construir array de filtros PostgREST como strings para .or() combinado
  // o como condiciones individuales
  const filters: { method: string; args: any[] }[] = []

  // Filtro de rol
  if (opts.roleFilter.type === "or") {
    filters.push({ method: "or", args: [opts.roleFilter.value] })
  }

  // Filtro de estado
  if (opts.status && opts.status !== "ALL") {
    if (opts.status === "ACTIVE") {
      filters.push({ method: "or", args: ["status.eq.PENDING,status.eq.IN_PROGRESS"] })
    } else {
      filters.push({ method: "eq", args: ["status", opts.status] })
    }
  }

  // Filtros comunes
  if (opts.priority && opts.priority !== "ALL") {
    filters.push({ method: "eq", args: ["priority", opts.priority] })
  }
  if (opts.assignedTo && opts.assignedTo !== "ALL") {
    filters.push({ method: "eq", args: ["assigned_to", opts.assignedTo] })
  }
  if (opts.operationId) {
    filters.push({ method: "eq", args: ["operation_id", opts.operationId] })
  }

  // Filtro de fecha
  if (opts.dateFilter) {
    if (opts.dateFilter.type === "range") {
      filters.push({ method: "gte", args: ["due_date", opts.dateFilter.start] })
      filters.push({ method: "lte", args: ["due_date", opts.dateFilter.end] })
    } else if (opts.dateFilter.type === "null") {
      filters.push({ method: "is", args: ["due_date", null] })
    }
  }

  // Construir query en una sola cadena
  // Nota: "tasks" as any para evitar error de tipos ya que tasks no está en Database types
  let query = (supabase as any)
    .from("tasks")
    .select(TASK_SELECT, opts.withCount ? { count: "exact" } : undefined)

  // Aplicar filtros secuencialmente
  for (const f of filters) {
    query = query[f.method](...f.args)
  }

  // Aplicar ordenamiento
  for (const o of opts.orderBy) {
    const orderOpts: any = { ascending: o.ascending }
    if (o.nullsFirst !== undefined) orderOpts.nullsFirst = o.nullsFirst
    query = query.order(o.column, orderOpts)
  }

  // Aplicar rango
  query = query.range(opts.rangeStart, opts.rangeEnd)

  return await query
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

    const { data: task, error } = await (supabase as any)
      .from("tasks")
      .insert(taskData)
      .select(TASK_SELECT)
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
