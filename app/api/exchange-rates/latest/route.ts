import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

/**
 * Intenta obtener el dólar oficial desde dolarapi.com (API pública del BCRA)
 * Retorna el precio de venta (el que se usa para AFIP)
 */
async function fetchBcraRate(): Promise<number | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Usar precio de venta (usado para facturas)
    const rate = data.venta || data.compra
    return rate && rate > 1 ? Number(rate) : null
  } catch {
    return null
  }
}

// GET - Obtener tipo de cambio más reciente
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // 1. Intentar desde la DB
    const dbRate = await getLatestExchangeRate(supabase)
    if (dbRate && dbRate > 1) {
      return NextResponse.json({ rate: dbRate, source: 'db' })
    }

    // 2. Fallback: obtener desde dolarapi.com (tipo de cambio oficial BCRA)
    const bcraRate = await fetchBcraRate()
    if (bcraRate) {
      return NextResponse.json({ rate: bcraRate, source: 'bcra' })
    }

    return NextResponse.json(
      { error: "No se encontró tipo de cambio" },
      { status: 404 }
    )
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("Error in GET /api/exchange-rates/latest:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener tipo de cambio" },
      { status: 500 }
    )
  }
}
