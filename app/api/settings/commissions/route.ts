import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { hasAdminRole } from "@/lib/permissions"

/**
 * Reglas de comisión de la organización (`commission_rules`).
 *
 * VIB-124: una regla puede apuntar a un vendedor concreto (`seller_id`), a una
 * agencia (`agency_id`) o a nadie (genérica de la org). Hasta acá la pantalla
 * ignoraba `seller_id` por completo, asi que el admin veía N filas idénticas
 * salvo el número y no podía saber a quién le estaba cambiando el porcentaje.
 * El GET devuelve el nombre del vendedor y el POST permite elegirlo.
 *
 * Ojo con la precedencia (ver `lib/commissions/seller-commission-profile.ts`):
 * una regla con `seller_id` **le gana** a `users.default_commission_percentage`.
 * O sea que crear una acá deja inerte el campo de Configuración → Usuarios para
 * ese vendedor.
 */

/** Vendedor embebido que devuelve el join; PostgREST puede darlo como array. */
function extractSellerName(joined: unknown): string | null {
  if (!joined) return null
  const row = Array.isArray(joined) ? joined[0] : joined
  if (!row || typeof row !== "object") return null
  const { name, email } = row as { name?: string | null; email?: string | null }
  return name || email || null
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // hasAdminRole en vez de comparar el string: el literal dejaba afuera a
    // ORG_OWNER (dueño del tenant) y a quien lo tuviera en additional_roles.
    if (!hasAdminRole((user as any).roles ?? [user.role])) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    if (!user.org_id) {
      return NextResponse.json(
        { error: "Usuario sin organizacion asociada" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("type") // SELLER | AGENCY
    const agencyId = searchParams.get("agencyId")

    // El scoping por org_id va explícito. RLS ya aísla por tenant, pero
    // `AGENTS.md` pide no depender solo de RLS en endpoints user-facing.
    let query = supabase
      .from("commission_rules")
      .select("*, seller:seller_id(id, name, email)")
      .eq("org_id", user.org_id)
      .order("valid_from", { ascending: false })

    if (type) {
      query = query.eq("type", type)
    }

    if (agencyId) {
      query = query.eq("agency_id", agencyId)
    }

    const { data: rules, error } = await query

    if (error) {
      console.error("Error fetching commission rules:", error)
      return NextResponse.json({ error: "Error al obtener reglas de comisión" }, { status: 500 })
    }

    // Se aplana a `seller_name` para que la tabla no tenga que saber la forma
    // del join, y se descarta el resto del usuario (no hace falta en pantalla).
    const withSellerName = (rules || []).map((rule: any) => {
      const { seller, ...rest } = rule
      return { ...rest, seller_name: extractSellerName(seller) }
    })

    return NextResponse.json({ rules: withSellerName })
  } catch (error) {
    console.error("Error in GET /api/settings/commissions:", error)
    return NextResponse.json({ error: "Error al obtener reglas de comisión" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!hasAdminRole((user as any).roles ?? [user.role])) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    if (!user.org_id) {
      return NextResponse.json(
        { error: "Usuario sin organizacion asociada" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { type, basis, value, destination_region, agency_id, seller_id, valid_from, valid_to } =
      body

    if (!type || !basis || value === undefined || !valid_from) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // El vendedor tiene que ser de la misma org. Sin esto, un admin podría
    // apuntar una regla suya a un usuario de otro tenant mandando el id a mano.
    if (seller_id) {
      const { data: seller } = await supabase
        .from("users")
        .select("id")
        .eq("id", seller_id)
        .eq("org_id", user.org_id)
        .maybeSingle()

      if (!seller) {
        return NextResponse.json(
          { error: "El vendedor no pertenece a esta organización" },
          { status: 400 }
        )
      }
    }

    const ruleData: Record<string, any> = {
      type,
      basis,
      value: Number(value),
      valid_from,
      valid_to: valid_to || null,
      destination_region: destination_region || null,
      agency_id: agency_id || null,
      // Solo las reglas de vendedor llevan seller_id; una regla de agencia con
      // vendedor cargado seria ambigua para el motor de calculo.
      seller_id: type === "SELLER" ? seller_id || null : null,
      // Explícito aunque exista `trg_auto_org_id_commission_rules`: ese trigger
      // resuelve la org desde auth.uid(), que con service role no existe.
      org_id: user.org_id,
    }

    const { data: rule, error } = await (supabase.from("commission_rules") as any)
      .insert(ruleData)
      .select()
      .single()

    if (error) {
      console.error("Error creating commission rule:", error)
      return NextResponse.json({ error: "Error al crear regla de comisión" }, { status: 500 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    console.error("Error in POST /api/settings/commissions:", error)
    return NextResponse.json({ error: "Error al crear regla de comisión" }, { status: 500 })
  }
}
