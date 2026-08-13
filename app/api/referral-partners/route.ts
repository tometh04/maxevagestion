import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

export const dynamic = "force-dynamic"

/**
 * Socios referidores (VIB-62): agencias/empresas que derivan clientes.
 * Se gestionan a nivel org y se seleccionan al cargar un cliente referido.
 *
 * Permisos (VIB-86): el módulo propio es `referrals`. Antes se gateaba con
 * `customers` —"quien carga clientes carga referidores"— y ese es justamente el
 * supuesto que el ticket vino a romper: SELLER tiene `customers.write`, así que
 * podía dar de alta referidores y ver cuánto se lleva cada uno.
 *
 * Quien no tiene `referrals.read` recibe SOLO id y nombre. El porcentaje no
 * sale del servidor: esconderlo en la pantalla y dejar la API abierta no es un
 * permiso.
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

    // El vendedor necesita la lista para poder seleccionar un referidor al
    // cargar un cliente, aunque no pueda ver ni administrar sus comisiones.
    const puedeVerComisiones = canPerformAction(user, "referrals", "read", perms)
    const puedeSeleccionar =
      puedeVerComisiones || canPerformAction(user, "customers", "write", perms)

    if (!puedeSeleccionar) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get("include_inactive") === "true"

    // La proyección es la que protege el dato: sin `referrals.read` el
    // porcentaje ni se lee de la base.
    let query = (supabase.from("referral_partners") as any)
      .select(puedeVerComisiones ? "*" : "id, name")
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

    // `canManage` viaja explícito en vez de deducirse de si vino el porcentaje:
    // un CONTABLE ve las comisiones pero no da de alta referidores, y sin esta
    // distinción la pantalla le ofrecería un botón que termina en 403.
    return NextResponse.json({
      partners: data ?? [],
      canManage: canPerformAction(user, "referrals", "write", perms),
    })
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

    // VIB-86: los referidores los da de alta el administrador. Antes alcanzaba
    // con `customers.write`, que el vendedor tiene.
    if (!canPerformAction(user, "referrals", "write", perms)) {
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
