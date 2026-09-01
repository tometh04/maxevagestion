import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = 'force-dynamic'

// GET - Obtener usuarios de las agencias del usuario actual
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const role = searchParams.get("role")
    const search = searchParams.get("search")
    const excludeUserId = searchParams.get("exclude")

    // Obtener agencias del usuario directamente
    const { data: userAgenciesData, error: agencyError } = await (supabase.from("user_agencies") as any)
      .select("agency_id")
      .eq("user_id", user.id)

    if (agencyError) {
      console.error("Error getting user agencies:", agencyError)
      return NextResponse.json({ users: [] })
    }

    const agencyIds = (userAgenciesData || []).map((ua: any) => ua.agency_id)

    // Si no hay agencias, retornar vacío
    if (!agencyIds || agencyIds.length === 0) {
      return NextResponse.json({ users: [] })
    }

    // Obtener IDs de usuarios de las agencias
    const { data: allUserAgencies, error: userAgenciesError } = await (supabase.from("user_agencies") as any)
      .select("user_id")
      .in("agency_id", agencyIds)

    if (userAgenciesError) {
      console.error("Error fetching user_agencies:", userAgenciesError)
      return NextResponse.json({ users: [] })
    }

    const allUserIds = (allUserAgencies || []).map((ua: any) => ua.user_id)
    const userIds = Array.from(new Set(allUserIds)) as string[]

    if (userIds.length === 0) {
      return NextResponse.json({ users: [] })
    }

    // Query de usuarios - columnas reales: id, auth_id, name, email, role, is_active, created_at, updated_at
    let query = (supabase.from("users") as any)
      .select("id, name, email, role, is_active, created_at, default_commission_percentage")
      .in("id", userIds)
      .eq("is_active", true)

    // Filtros opcionales
    if (role) {
      const roles = role.split(",").map((r) => r.trim()).filter(Boolean)
      query = roles.length === 1 ? query.eq("role", roles[0]) : query.in("role", roles)
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    if (excludeUserId) {
      query = query.neq("id", excludeUserId)
    }

    const { data: usersData, error } = await query

    if (error) {
      console.error("Error fetching users:", error)
      return NextResponse.json(
        { error: "Error al obtener usuarios" },
        { status: 500 }
      )
    }
    
    // Porcentaje EFECTIVO, aparte del de la ficha (VIB-173).
    //
    // Se agrega en vez de pisar `default_commission_percentage` a propósito: la
    // pantalla de Reglas de Comisiones necesita el valor CRUDO de la ficha para
    // poder decir "hoy cobra X y sale de tal lado". Los diálogos de operación,
    // en cambio, necesitan el efectivo, porque con él calculan el tope de las
    // ventas compartidas y ese tope lo valida el servidor con el efectivo.
    const { resolveSellerCommissionProfiles } = await import(
      "@/lib/commissions/seller-commission-profile"
    )
    let effectiveById = new Map<string, number | null>()
    try {
      const profiles = await resolveSellerCommissionProfiles(
        supabase,
        (user as any).org_id,
        (usersData || []).map((u: any) => u.id)
      )
      effectiveById = new Map(
        Array.from(profiles.entries()).map(([id, p]) => [id, p.percentage])
      )
    } catch (err) {
      // Best-effort: sin esto los diálogos caen al valor de la ficha, que es el
      // comportamiento de antes, no una pantalla rota.
      console.error("[users] No se pudo resolver el porcentaje efectivo:", err)
    }

    // Transformar los datos para compatibilidad con el frontend
    const users = (usersData || []).map((u: any) => {
      const nameParts = (u.name || '').split(' ')
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        is_active: u.is_active,
        created_at: u.created_at,
        // Ya venía en el select pero se perdía en el mapeo. Lo necesita la
        // pantalla de Reglas de Comisiones para mostrar, al elegir un vendedor,
        // qué porcentaje tiene hoy y qué le va a quedar tapado (VIB-124).
        default_commission_percentage: u.default_commission_percentage ?? null,
        // El que manda para el reparto de una venta compartida.
        effective_commission_percentage: effectiveById.has(u.id)
          ? effectiveById.get(u.id) ?? null
          : u.default_commission_percentage ?? null,
        // Campos derivados para compatibilidad
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        avatar_url: null,
        phone: null,
      }
    })

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error("Error in GET /api/users:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener usuarios" },
      { status: 500 }
    )
  }
}
