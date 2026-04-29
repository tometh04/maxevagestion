import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { computeObjectiveProgress } from "@/lib/commissions/objectives-progress"

export const dynamic = "force-dynamic"

/**
 * GET /api/commissions/objectives/progress?seller_id=X
 *
 * Devuelve el progreso calculado on-demand de los objetivos activos que
 * aplican al seller indicado.
 *
 * Reglas de acceso:
 *  - SELLER: sólo puede consultar su propio seller_id (se fuerza a user.id).
 *  - ADMIN/SUPER_ADMIN/CONTABLE: pueden consultar cualquier seller_id.
 *
 * "Aplican al seller": is_active=true AND (seller_id = X OR seller_id IS NULL).
 * Se filtra por agencia del seller cuando el objetivo tiene agency_id definido.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const requestedSellerId = searchParams.get("seller_id")

    // SELLER sólo puede ver lo propio. Cualquier otro rol puede especificar.
    const sellerId =
      user.role === "SELLER" ? user.id : requestedSellerId || user.id

    if (!sellerId) {
      return NextResponse.json({ error: "seller_id requerido" }, { status: 400 })
    }

    // Agencia del seller (si existe), para filtrar objetivos específicos de agencia
    let sellerAgencyIds: string[] = []
    try {
      const { data: userAgencies } = await (supabase.from("user_agencies") as any)
        .select("agency_id")
        .eq("user_id", sellerId)
      sellerAgencyIds = (userAgencies || [])
        .map((ua: any) => ua.agency_id)
        .filter(Boolean)
    } catch {
      // Si falla el lookup de agencias, seguimos con lista vacía (solo
      // matchea objetivos sin agency_id).
    }

    // Traer objetivos activos que aplican al seller:
    //   is_active=true AND (seller_id = X OR seller_id IS NULL)
    //   AND (agency_id IS NULL OR agency_id IN sellerAgencyIds)
    let query = (supabase.from("seller_objectives") as any)
      .select("id, name, description, metric_type, target_value, target_currency, reward_type, reward_value, reward_currency, period_type, seller_id, agency_id")
      .eq("is_active", true)

    // (seller_id = X OR seller_id IS NULL)
    query = query.or(`seller_id.eq.${sellerId},seller_id.is.null`)

    const { data: objectives, error } = await query

    if (error) {
      console.error("Error fetching active objectives:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtro de agencia en memoria (supabase or() + in() combinados son
    // frágiles; más simple filtrar acá). Un objetivo con agency_id NULL
    // aplica a cualquier agencia; con agency_id específico solo aplica si
    // el seller está en esa agencia.
    const applicableObjectives = ((objectives as any[]) || []).filter((obj) => {
      if (!obj.agency_id) return true
      return sellerAgencyIds.includes(obj.agency_id)
    })

    // Calcular progreso de cada objetivo en paralelo
    const progress = await Promise.all(
      applicableObjectives.map(async (obj) => {
        const p = await computeObjectiveProgress(supabase, obj, sellerId)
        return {
          ...p,
          objective: {
            id: obj.id,
            name: obj.name,
            description: obj.description,
            metric_type: obj.metric_type,
            target_currency: obj.target_currency,
            reward_type: obj.reward_type,
            reward_value: obj.reward_value,
            reward_currency: obj.reward_currency,
            period_type: obj.period_type,
            seller_id: obj.seller_id,
            agency_id: obj.agency_id,
          },
        }
      })
    )

    return NextResponse.json({ progress, seller_id: sellerId })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in objectives/progress GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
