import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { getAfipExchangeRate } from "@/lib/afip/afip-client"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/invoices/exchange-rate?currency=DOL&date=YYYY-MM-DD&agency_id=<uuid>
 *
 * Devuelve la cotización OFICIAL de AFIP que se debe usar al emitir facturas.
 * AFIP rechaza con error 10119 si la cotización enviada difiere más del ±2%
 * del tipo de cambio oficial vigente a la fecha del comprobante.
 *
 * Si se omite date, usa hoy. Si se omite agency_id, usa la primera agencia
 * del usuario con AFIP configurado.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const currency = (searchParams.get("currency") || "DOL").toUpperCase()
    const dateParam = searchParams.get("date")
    const agencyIdParam = searchParams.get("agency_id")

    const date = dateParam ? new Date(dateParam + "T12:00:00") : new Date()

    // Resolver agencia a usar
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "Usuario sin agencias asignadas" },
        { status: 403 }
      )
    }

    const targetAgencyId =
      agencyIdParam && agencyIds.includes(agencyIdParam)
        ? agencyIdParam
        : agencyIds[0]

    const afipConfig = await getAfipConfigForAgency(supabase, targetAgencyId)
    if (!afipConfig) {
      return NextResponse.json(
        { error: "AFIP no configurado para esta agencia" },
        { status: 400 }
      )
    }

    const result = await getAfipExchangeRate(afipConfig, currency, date)

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || "Error al consultar cotización AFIP" },
        { status: 502 }
      )
    }

    return NextResponse.json({
      currency: result.data.MonId,
      rate: result.data.MonCotiz,
      date: result.data.FchCotiz,
      source: "AFIP",
    })
  } catch (error: any) {
    console.error("Error en GET /api/invoices/exchange-rate:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener cotización" },
      { status: 500 }
    )
  }
}
