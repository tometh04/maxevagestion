import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule, isOwnDataOnly } from "@/lib/permissions"

export async function GET() {
  try {
    const { user } = await getCurrentUser()

    // Verificar permiso de acceso al módulo customers
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json({ error: "No tiene permiso para ver clientes" }, { status: 403 })
    }

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Obtener día y mes actual
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()

    // Buscar clientes con cumpleaños hoy (scopeado por org)
    let query = (supabase.from("customers") as any)
      .select("id, first_name, last_name, phone, date_of_birth")
      .eq("org_id", (user as any).org_id)
      .not("date_of_birth", "is", null)
      .not("phone", "is", null)

    const { data: customers, error } = await query

    if (error) {
      console.error("Error fetching birthdays:", error)
      return NextResponse.json({ customers: [] })
    }

    // Filtrar clientes cuyo cumpleaños es hoy
    let birthdayCustomers = (customers || []).filter((customer: any) => {
      if (!customer.date_of_birth) return false
      const dob = new Date(customer.date_of_birth)
      return dob.getMonth() + 1 === month && dob.getDate() === day
    })

    // Si es SELLER con ownDataOnly, filtrar solo clientes de sus operaciones
    if (isOwnDataOnly(user.role as any, "customers")) {
      const { data: sellerOps } = await (supabase.from("operations") as any)
        .select("id")
        .eq("org_id", (user as any).org_id)
        .or(`seller_primary_id.eq.${user.id},seller_secondary_id.eq.${user.id}`)

      const sellerOpIds = (sellerOps || []).map((op: any) => op.id)

      if (sellerOpIds.length === 0) {
        return NextResponse.json({ customers: [] })
      }

      const { data: opCustomers } = await (supabase.from("operation_customers") as any)
        .select("customer_id")
        .in("operation_id", sellerOpIds)
        .eq("org_id", (user as any).org_id)

      const sellerCustomerIds = new Set((opCustomers || []).map((oc: any) => oc.customer_id))
      birthdayCustomers = birthdayCustomers.filter((c: any) => sellerCustomerIds.has(c.id))
    }

    return NextResponse.json({ customers: birthdayCustomers })
  } catch (error: any) {
    console.error("Error in birthdays-today:", error)
    return NextResponse.json({ customers: [] })
  }
}

