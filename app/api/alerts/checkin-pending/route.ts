import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const { user } = await getCurrentUser()

    if (!(user as any).org_id) {
      return NextResponse.json({ alerts: [] })
    }

    const supabase = await createServerClient()

    const { data, error } = await (supabase
      .from("alerts") as any)
      .select(`
        id,
        description,
        date_due,
        operations:operation_id (
          id,
          destination,
          departure_date,
          airline_name
        )
      `)
      .eq("org_id", (user as any).org_id)
      .eq("user_id", user.id)
      .eq("type", "CHECKIN_REMINDER")
      .eq("status", "PENDING")
      .order("date_due", { ascending: true })
      .limit(20)

    if (error) throw error

    return NextResponse.json({ alerts: data ?? [] })
  } catch (error) {
    console.error("Error fetching pending checkin alerts:", error)
    return NextResponse.json({ alerts: [] })
  }
}
