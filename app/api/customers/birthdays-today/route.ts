import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Obtener día y mes actual
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()

    // Buscar clientes con cumpleaños hoy
    // Nota: En Supabase, date_of_birth es tipo date, podemos extraer mes y día
    let query = (supabase.from("customers") as any)
      .select("id, first_name, last_name, phone, date_of_birth, agency_id")
      .not("date_of_birth", "is", null)
      .not("phone", "is", null)

    // Filtrar por agencias si no es SUPER_ADMIN
    if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      query = query.in("agency_id", agencyIds)
    }

    const { data: customers, error } = await query

    if (error) {
      console.error("Error fetching birthdays:", error)
      return NextResponse.json({ customers: [] })
    }

    // Filtrar clientes cuyo cumpleaños es hoy
    const birthdayCustomers = (customers || []).filter((customer: any) => {
      if (!customer.date_of_birth) return false
      const dob = new Date(customer.date_of_birth)
      return dob.getMonth() + 1 === month && dob.getDate() === day
    })

    return NextResponse.json({ customers: birthdayCustomers })
  } catch (error: any) {
    console.error("Error in birthdays-today:", error)
    return NextResponse.json({ customers: [] })
  }
}

