import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { getPointsOfSale } from "@/lib/afip/afip-client"

export const dynamic = 'force-dynamic'

// Verifica si un tipo de punto de venta es compatible con web services (WSFEv1)
// AFIP devuelve EmisionTipo con descripciones largas como:
//   "RECE para aplicativo y web services"   → Responsable Inscripto
//   "Factura Electronica - Monotributo - Web Services"
//   "CAEA"
// Los de tipo OFFLINE/fiscal no sirven para WSFEv1
function isWebServiceTipo(tipo: string): boolean {
  const t = tipo.toUpperCase().trim()
  return (
    t.includes('WEB SERVICE') ||
    t.includes('WEB SERVICES') ||
    t.includes('RECE') ||
    t === 'CAE' ||
    t === 'CAEA' ||
    t.startsWith('CAE')
  )
}

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

        // Obtener puntos de venta desde AFIP
        const result = await getPointsOfSale(afipConfig)

        if (!result.success || !result.data) {
          return {
            agency_id: agency.id,
            agency_name: agency.name,
            points_of_sale: [],
            has_ws_points: false,
            default_point_of_sale: afipConfig.point_of_sale,
          }
        }

        // Filtrar solo los habilitados para web services (CAE, "CAE - Monotributo", CAEA)
        // Los de tipo OFFLINE son para facturación manual y no funcionan con WSFEv1
        const activePointsOfSale = (result.data || [])
          .filter((pv: any) => {
            const tipo = pv.tipo || pv.EmisionTipo || ''
            return !pv.bloqueado && isWebServiceTipo(tipo)
          })
          .map((pv: any) => ({
            numero: pv.numero,
            tipo: (pv.tipo || pv.EmisionTipo || '').toUpperCase().trim(),
            bloqueado: false,
          }))

        return {
          agency_id: agency.id,
          agency_name: agency.name,
          points_of_sale: activePointsOfSale,
          has_ws_points: activePointsOfSale.length > 0,
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
