import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

export const dynamic = "force-dynamic"

/**
 * Socios referidores (VIB-62): agencias/empresas que derivan clientes.
 * Se gestionan a nivel org y se seleccionan al cargar un cliente referido.
 * Permisos: se gatean por el módulo `customers` (quien carga clientes carga
 * referidores).
 */

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = await resolveUserPermissions(
      supabase as any,
      user.id,
      user.org_id,
      (user as any).roles ?? [user.role],
      agencyIds,
    )

    if (!canPerformAction(user, "customers", "read", perms)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get("include_inactive") === "true"

    let query = (supabase.from("referral_partners") as any)
      .select("*")
      .eq("org_id", user.org_id)
      .order("name", { ascending: true })

    if (!includeInactive) {
      query = query.eq("active", true)
    }

    const { data, error } = await query
    if (error) {
      console.error("Error listando referral_partners:", error)
      return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }

    return NextResponse.json({ partners: data ?? [] })
  } catch (error) {
    console.error("Error in GET /api/referral-partners:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = await resolveUserPermissions(
      supabase as any,
      user.id,
      user.org_id,
      (user as any).roles ?? [user.role],
      agencyIds,
    )

    if (!canPerformAction(user, "customers", "write", perms)) {
      return NextResponse.json({ error: "No tiene permiso para crear referidores" }, { status: 403 })
    }

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "El nombre del referidor es requerido" }, { status: 400 })
    }

    // Normalizar y validar el % por defecto (0–100).
    let defaultPct = 0
    if (body.default_commission_percentage != null && body.default_commission_percentage !== "") {
      defaultPct = Number(body.default_commission_percentage)
      if (!Number.isFinite(defaultPct) || defaultPct < 0 || defaultPct > 100) {
        return NextResponse.json({ error: "El porcentaje debe estar entre 0 y 100" }, { status: 400 })
      }
    }

    const { data, error } = await (supabase.from("referral_partners") as any)
      .insert({
        org_id: user.org_id,
        agency_id: agencyIds[0] ?? null,
        name,
        contact_name: body.contact_name?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
        default_commission_percentage: defaultPct,
        active: body.active === false ? false : true,
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !data) {
      console.error("Error creando referral_partner:", error)
      return NextResponse.json({ error: "Error al crear el referidor" }, { status: 400 })
    }

    return NextResponse.json({ partner: data })
  } catch (error) {
    console.error("Error in POST /api/referral-partners:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
