import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

export const dynamic = "force-dynamic"

/**
 * Editar / dar de baja un socio referidor (VIB-62). Gateado por el módulo
 * `customers` (paridad con el alta). La baja es lógica (active = false) si el
 * referidor ya tiene comisiones registradas, para no perder el historial de lo
 * que se le liquidó; se permite borrar en duro solo si nunca generó comisiones.
 */

async function authorize(request: Request) {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return { error: NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 }) }
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
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { user, supabase }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (auth.error) return auth.error
    const { user, supabase } = auth
    const { id } = await params
    const body = await request.json()

    const update: any = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
      update.name = name
    }
    if (body.contact_name !== undefined) update.contact_name = body.contact_name?.trim() || null
    if (body.phone !== undefined) update.phone = body.phone?.trim() || null
    if (body.email !== undefined) update.email = body.email?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.active !== undefined) update.active = !!body.active
    if (body.default_commission_percentage !== undefined) {
      const pct = Number(body.default_commission_percentage)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: "El porcentaje debe estar entre 0 y 100" }, { status: 400 })
      }
      update.default_commission_percentage = pct
    }

    const { data, error } = await (supabase.from("referral_partners") as any)
      .update(update)
      .eq("id", id)
      .eq("org_id", user.org_id)
      .select()
      .single()

    if (error || !data) {
      console.error("Error actualizando referral_partner:", error)
      return NextResponse.json({ error: "Error al actualizar el referidor" }, { status: 400 })
    }

    return NextResponse.json({ partner: data })
  } catch (error) {
    console.error("Error in PATCH /api/referral-partners/[id]:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (auth.error) return auth.error
    const { user, supabase } = auth
    const { id } = await params

    // Si ya generó comisiones, no borramos en duro: baja lógica para conservar
    // el historial de liquidaciones y no dejar comisiones huérfanas.
    const { count } = await (supabase.from("referral_commissions") as any)
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.org_id)
      .eq("referral_partner_id", id)

    if ((count ?? 0) > 0) {
      const { data, error } = await (supabase.from("referral_partners") as any)
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", user.org_id)
        .select()
        .single()
      if (error) {
        console.error("Error desactivando referral_partner:", error)
        return NextResponse.json({ error: "Error al desactivar el referidor" }, { status: 400 })
      }
      return NextResponse.json({ deactivated: true, partner: data })
    }

    const { error } = await (supabase.from("referral_partners") as any)
      .delete()
      .eq("id", id)
      .eq("org_id", user.org_id)

    if (error) {
      console.error("Error borrando referral_partner:", error)
      return NextResponse.json({ error: "Error al borrar el referidor" }, { status: 400 })
    }

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error("Error in DELETE /api/referral-partners/[id]:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
