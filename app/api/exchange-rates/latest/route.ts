import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

// GET - Obtener tipo de cambio más reciente
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    
    const rate = await getLatestExchangeRate(supabase)
    
    if (!rate) {
      return NextResponse.json(
        { error: "No se encontró tipo de cambio" },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ rate })
  } catch (error: any) {
    console.error("Error in GET /api/exchange-rates/latest:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener tipo de cambio" },
      { status: 500 }
    )
  }
}
