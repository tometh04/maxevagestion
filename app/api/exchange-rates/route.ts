import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

async function fetchBcraRate(): Promise<number | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const rate = data.venta || data.compra
    return rate && rate > 1 ? Number(rate) : null
  } catch {
    return null
  }
}

// GET - Obtener tipo de cambio por fecha o el más reciente
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const date = searchParams.get("date")

    let rate: number | null = null

    if (date) {
      rate = await getExchangeRate(supabase, date)
    } else {
      rate = await getLatestExchangeRate(supabase)
    }

    // Fallback: si no hay TC en DB, usar API del BCRA
    if (!rate || rate <= 1) {
      rate = await fetchBcraRate()
    }

    if (!rate) {
      return NextResponse.json(
        { error: "No se encontró tipo de cambio" },
        { status: 404 }
      )
    }

    return NextResponse.json({ rate, source: 'bcra_fallback' })
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("Error in GET /api/exchange-rates:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener tipo de cambio" },
      { status: 500 }
    )
  }
}
