import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

// GET - Obtener tipo de cambio por fecha o el más reciente
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const date = searchParams.get("date")
    
    let rate: number | null = null
    
    if (date) {
      // Obtener TC para fecha específica
      rate = await getExchangeRate(supabase, date)
    } else {
      // Obtener TC más reciente
      rate = await getLatestExchangeRate(supabase)
    }
    
    if (!rate) {
      return NextResponse.json(
        { error: "No se encontró tipo de cambio" },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ rate })
  } catch (error: any) {
    console.error("Error in GET /api/exchange-rates:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener tipo de cambio" },
      { status: 500 }
    )
  }
}
