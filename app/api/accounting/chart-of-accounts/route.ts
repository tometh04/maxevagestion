import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const category = searchParams.get("category") // ACTIVO, PASIVO, PATRIMONIO_NETO, RESULTADO
    const includeInactive = searchParams.get("includeInactive") === "true"

    let query = supabase
      .from("chart_of_accounts")
      .select("*")
      .order("display_order", { ascending: true })
      .order("account_code", { ascending: true })

    if (category && category !== "ALL") {
      query = query.eq("category", category)
    }

    if (!includeInactive) {
      query = query.eq("is_active", true)
    }

    const { data: accounts, error } = await query

    if (error) {
      console.error("Error fetching chart of accounts:", error)
      return NextResponse.json({ error: "Error al obtener plan de cuentas" }, { status: 500 })
    }

    // Organizar en jerarquía (padres e hijos)
    const accountsMap = new Map((accounts || []).map((acc: any) => [acc.id, acc]))
    const rootAccounts: any[] = []
    const childrenMap = new Map<string, any[]>()

    for (const account of accounts || []) {
      if (!account.parent_id) {
        rootAccounts.push(account)
      } else {
        if (!childrenMap.has(account.parent_id)) {
          childrenMap.set(account.parent_id, [])
        }
        childrenMap.get(account.parent_id)!.push(account)
      }
    }

    // Agregar hijos a cada cuenta padre
    const buildTree = (account: any): any => {
      const children = childrenMap.get(account.id) || []
      return {
        ...account,
        children: children.map(buildTree)
      }
    }

    const tree = rootAccounts.map(buildTree)

    return NextResponse.json({ accounts: tree, flat: accounts || [] })
  } catch (error) {
    console.error("Error in GET /api/accounting/chart-of-accounts:", error)
    return NextResponse.json({ error: "Error al obtener plan de cuentas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "accounting", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear cuentas" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      account_code,
      account_name,
      category,
      subcategory,
      account_type,
      level,
      parent_id,
      is_movement_account,
      display_order,
      description,
    } = body

    if (!account_code || !account_name || !category) {
      return NextResponse.json({ error: "account_code, account_name y category son requeridos" }, { status: 400 })
    }

    const { data, error } = await (supabase.from("chart_of_accounts") as any)
      .insert({
        account_code,
        account_name,
        category,
        subcategory: subcategory || null,
        account_type: account_type || null,
        level: level || 1,
        parent_id: parent_id || null,
        is_movement_account: is_movement_account || false,
        display_order: display_order || 0,
        description: description || null,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating chart account:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ account: data }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/chart-of-accounts:", error)
    return NextResponse.json({ error: error.message || "Error al crear cuenta" }, { status: 500 })
  }
}

