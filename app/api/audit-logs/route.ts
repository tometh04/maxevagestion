import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Solo ADMIN y SUPER_ADMIN pueden ver logs
    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role as string)) {
      return NextResponse.json({ error: "No tiene permisos para ver logs" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = (page - 1) * limit

    const action = searchParams.get("action") || undefined
    const entityType = searchParams.get("entity_type") || undefined
    const userId = searchParams.get("user_id") || undefined
    const dateFrom = searchParams.get("date_from") || undefined
    const dateTo = searchParams.get("date_to") || undefined
    const search = searchParams.get("search") || undefined

    // Construir query
    let query = (supabase.from("audit_logs") as any)
      .select(`
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        ip_address,
        created_at,
        users:user_id (
          id, name, email
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })

    // Filtros
    if (action) {
      query = query.eq("action", action)
    }
    if (entityType) {
      query = query.eq("entity_type", entityType)
    }
    if (userId) {
      query = query.eq("user_id", userId)
    }
    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`)
    }
    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`)
    }
    if (search) {
      // Buscar en action, entity_type o details (cast a text)
      query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%`)
    }

    // Paginación
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      // Si la tabla no existe
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json({
          logs: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
          tableNotFound: true,
        })
      }
      console.error("Error fetching audit logs:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Obtener acciones únicas para filtros
    const { data: actionTypes } = await (supabase.from("audit_logs") as any)
      .select("action")
      .limit(100)

    const uniqueActions = actionTypes
      ? Array.from(new Set((actionTypes as any[]).map((a: any) => a.action))).sort()
      : []

    // Obtener entity_types únicos
    const { data: entityTypes } = await (supabase.from("audit_logs") as any)
      .select("entity_type")
      .not("entity_type", "is", null)
      .limit(100)

    const uniqueEntityTypes = entityTypes
      ? Array.from(new Set((entityTypes as any[]).map((e: any) => e.entity_type).filter(Boolean))).sort()
      : []

    return NextResponse.json({
      logs: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      filters: {
        actions: uniqueActions,
        entityTypes: uniqueEntityTypes,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/audit-logs:", error)
    return NextResponse.json({ error: error.message || "Error al obtener logs" }, { status: 500 })
  }
}
