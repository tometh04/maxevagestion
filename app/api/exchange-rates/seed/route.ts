import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * POST /api/exchange-rates/seed
 * Seeds exchange rates for the last 12 months with reasonable USD/ARS rates.
 * Only accessible by SUPER_ADMIN.
 */
export async function POST() {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Generate monthly rates for the last 12 months
    // Using approximate historical USD/ARS rates (blue/MEP)
    const rates: { rate_date: string; rate: number; from_currency: string; to_currency: string; source: string; notes: string }[] = []

    const now = new Date()

    // Historical approximate rates (monthly averages, blue/MEP reference)
    // These are approximate and should be updated with real rates
    const monthlyRates: Record<string, number> = {
      "2025-04": 1250,
      "2025-05": 1280,
      "2025-06": 1300,
      "2025-07": 1320,
      "2025-08": 1350,
      "2025-09": 1380,
      "2025-10": 1400,
      "2025-11": 1420,
      "2025-12": 1440,
      "2026-01": 1460,
      "2026-02": 1480,
      "2026-03": 1500,
    }

    for (const [monthStr, rate] of Object.entries(monthlyRates)) {
      // Add rate for 1st and 15th of each month
      rates.push({
        rate_date: `${monthStr}-01`,
        rate,
        from_currency: "USD",
        to_currency: "ARS",
        source: "SEED",
        notes: "Tasa de cambio inicial (seed)",
      })
      rates.push({
        rate_date: `${monthStr}-15`,
        rate: Math.round(rate * 1.005), // Slight variation for mid-month
        from_currency: "USD",
        to_currency: "ARS",
        source: "SEED",
        notes: "Tasa de cambio inicial (seed)",
      })
    }

    // Filter out future dates
    const today = now.toISOString().split("T")[0]
    const validRates = rates.filter(r => r.rate_date <= today)

    // Upsert all rates
    const { error } = await (supabase.from("exchange_rates") as any)
      .upsert(validRates, {
        onConflict: "rate_date,from_currency,to_currency",
      })

    if (error) {
      console.error("Error seeding exchange rates:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: validRates.length,
      message: `Se cargaron ${validRates.length} tasas de cambio`,
    })
  } catch (error: any) {
    console.error("Error in POST /api/exchange-rates/seed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
