import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { getPointsOfSale } from "@/lib/afip/afip-client"

export const dynamic = 'force-dynamic'
// Aumentar timeout a 60s para dar tiempo a AFIP de responder
export const maxDuration = 60

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
          console.log(`[POS] Agencia ${agency.id} sin config AFIP`)
          return null
        }

        const hasCert = !!(afipConfig.cert && afipConfig.key)
        console.log(`[POS] Agencia ${agency.id}: cert=${hasCert}, pv=${afipConfig.point_of_sale}, env=${afipConfig.environment}`)

        // Obtener puntos de venta desde AFIP
        let activePointsOfSale: Array<{ numero: number; tipo: string; bloqueado: boolean }> = []
        let getSalesError: string | null = null

        try {
          const result = await getPointsOfSale(afipConfig)

          if (result.success && result.data && result.data.length > 0) {
            // Filtrar solo los habilitados para web services (CAE, "CAE - Monotributo", CAEA)
            activePointsOfSale = result.data
              .filter((pv: any) => !pv.bloqueado && isWebServiceTipo(pv.tipo || ''))
              .map((pv: any) => ({
                numero: pv.numero,
                tipo: (pv.tipo || '').toUpperCase().trim(),
                bloqueado: false,
              }))
            console.log(`[POS] AFIP devolvió ${result.data.length} PVs, ${activePointsOfSale.length} con WS`)
          } else {
            getSalesError = result.error || 'Sin datos de AFIP'
            console.error(`[POS] getSalesPoints falló: ${getSalesError}`)
          }
        } catch (err: any) {
          getSalesError = err.message
          console.error(`[POS] Error en getSalesPoints:`, err.message)
        }

        // FALLBACK: si no hay PVs de AFIP pero hay cert+PV configurado en DB, usarlo
        if (activePointsOfSale.length === 0 && afipConfig.point_of_sale && hasCert) {
          console.log(`[POS] Usando PV de fallback desde DB: ${afipConfig.point_of_sale}`)
          activePointsOfSale = [{
            numero: afipConfig.point_of_sale,
            tipo: 'CAE',
            bloqueado: false,
          }]
        }

        return {
          agency_id: agency.id,
          agency_name: agency.name,
          points_of_sale: activePointsOfSale,
          has_ws_points: activePointsOfSale.length > 0,
          default_point_of_sale: afipConfig.point_of_sale,
          has_cert: hasCert,
          _debug_error: getSalesError,
        }
      })
    )

    // Filtrar agencias sin AFIP configurado
    const validPointsOfSale = pointsOfSaleByAgency.filter(Boolean)

    return NextResponse.json({ pointsOfSale: validPointsOfSale })
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("Error in GET /api/invoices/points-of-sale:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener puntos de venta" },
      { status: 500 }
    )
  }
}
