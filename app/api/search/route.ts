import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const searchTerm = `%${query}%`
    const results: Array<{
      id: string
      type: string
      title: string
      subtitle?: string
    }> = []

    // Buscar clientes
    const { data: customers } = await (supabase.from("customers") as any)
      .select("id, first_name, last_name, email, phone")
      .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`)
      .limit(5)

    if (customers) {
      customers.forEach((c: any) => {
        results.push({
          id: c.id,
          type: "customer",
          title: `${c.first_name} ${c.last_name}`,
          subtitle: c.email || c.phone,
        })
      })
    }

    // Buscar operaciones
    const { data: operations } = await (supabase.from("operations") as any)
      .select("id, file_code, destination, status")
      .or(`file_code.ilike.${searchTerm},destination.ilike.${searchTerm}`)
      .limit(5)

    if (operations) {
      operations.forEach((o: any) => {
        results.push({
          id: o.id,
          type: "operation",
          title: o.file_code || o.destination,
          subtitle: `${o.destination} - ${o.status}`,
        })
      })
    }

    // Buscar operadores
    const { data: operators } = await (supabase.from("operators") as any)
      .select("id, name, contact_email")
      .or(`name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`)
      .limit(5)

    if (operators) {
      operators.forEach((op: any) => {
        results.push({
          id: op.id,
          type: "operator",
          title: op.name,
          subtitle: op.contact_email,
        })
      })
    }

    // Buscar leads
    const { data: leads } = await (supabase.from("leads") as any)
      .select("id, contact_name, destination, status")
      .or(`contact_name.ilike.${searchTerm},destination.ilike.${searchTerm}`)
      .limit(5)

    if (leads) {
      leads.forEach((l: any) => {
        results.push({
          id: l.id,
          type: "lead",
          title: l.contact_name,
          subtitle: `${l.destination} - ${l.status}`,
        })
      })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Error in search:", error)
    return NextResponse.json({ results: [] })
  }
}

