import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { getPointsOfSale } from "@/lib/afip/afip-client"

export const dynamic = 'force-dynamic'

// GET - Obtener puntos de venta disponibles por agencia
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    if (agencyIds.length === 0) {
      return NextResponse.json({ pointsOfSale: [] })
    }

    // Obtener nombre de cada agencia
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, name")
      .in("id", agencyIds)

    if (!agencies || agencies.length === 0) {
      return NextResponse.json({ pointsOfSale: [] })
    }

    // Obtener puntos de venta para cada agencia con AFIP configurado
    const pointsOfSaleByAgency = await Promise.all(
      agencies.map(async (agency: any) => {
        const afipConfig = await getAfipConfigForAgency(supabase, agency.id)
        
        if (!afipConfig) {
          return null
        }

        // Obtener puntos de venta habilitados desde AFIP
        const result = await getPointsOfSale(afipConfig)
        
        if (!result.success || !result.data) {
          return {
            agency_id: agency.id,
            agency_name: agency.name,
            points_of_sale: [],
          }
        }

        // Filtrar solo puntos de venta habilitados para web services (CAE/CAEA)
        // Los de tipo OFFLINE son para facturación manual y no pueden autorizarse vía WSFE
        const WS_TIPOS = ['CAE', 'CAEA']
        const activePointsOfSale = (result.data || [])
          .filter((pv: any) => {
            const tipo = (pv.tipo || pv.EmisionTipo || '').toUpperCase()
            return !pv.bloqueado && WS_TIPOS.includes(tipo)
          })
          .map((pv: any) => ({
            numero: pv.numero,
            tipo: (pv.tipo || pv.EmisionTipo || '').toUpperCase(),
            bloqueado: pv.bloqueado || false,
          }))

        return {
          agency_id: agency.id,
          agency_name: agency.name,
          points_of_sale: activePointsOfSale,
          default_point_of_sale: afipConfig.point_of_sale,
        }
      })
    )

    // Filtrar agencias sin AFIP configurado
    const validPointsOfSale = pointsOfSaleByAgency.filter(Boolean)

    return NextResponse.json({ pointsOfSale: validPointsOfSale })
  } catch (error: any) {
    console.error("Error in GET /api/invoices/points-of-sale:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener puntos de venta" },
      { status: 500 }
    )
  }
}
