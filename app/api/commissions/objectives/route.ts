import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

// GET — List objectives with optional filters
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase: any = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Only ADMIN and SUPER_ADMIN can manage objectives
    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    let query = supabase
      .from("seller_objectives")
      .select(`
        *,
        seller:seller_id(id, name),
        agency:agency_id(id, name)
      `)
      .order("created_at", { ascending: false })

    const agencyId = searchParams.get("agency_id")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    const activeOnly = searchParams.get("active")
    if (activeOnly === "true") {
      query = query.eq("is_active", true)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching objectives:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ objectives: data || [] })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in objectives GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// POST — Create a new objective
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase: any = await createServerClient()

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await request.json()
    const {
      agency_id,
      name,
      description,
      metric_type,
      target_value,
      target_currency,
      reward_type,
      reward_value,
      reward_currency,
      period_type,
      seller_id,
    } = body

    // Validations
    if (!name) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    if (!metric_type) return NextResponse.json({ error: "El tipo de métrica es requerido" }, { status: 400 })
    if (!target_value || target_value <= 0) return NextResponse.json({ error: "El objetivo debe ser mayor a 0" }, { status: 400 })
    if (!reward_type) return NextResponse.json({ error: "El tipo de recompensa es requerido" }, { status: 400 })
    if (!reward_value || reward_value <= 0) return NextResponse.json({ error: "La recompensa debe ser mayor a 0" }, { status: 400 })

    const validMetrics = ["TRIPS_SOLD", "REVENUE_AMOUNT", "MARGIN_AMOUNT", "NEW_CUSTOMERS", "CONVERSION_RATE"]
    if (!validMetrics.includes(metric_type)) {
      return NextResponse.json({ error: "Tipo de métrica inválido" }, { status: 400 })
    }

    const validRewards = ["BONUS_PERCENTAGE", "BONUS_FIXED", "PERCENTAGE_INCREASE"]
    if (!validRewards.includes(reward_type)) {
      return NextResponse.json({ error: "Tipo de recompensa inválido" }, { status: 400 })
    }

    // P0 2026-05-10: resolver org_id explícito para INSERT (NOT NULL post-mig
     // 20260510000002). Si pasaron agency_id, derivar org desde ese agency
     // (y validar que pertenece al user — defense in depth además del RLS
     // WITH CHECK). Si no, usar user.org_id.
    let resolvedOrgId = (user as any).org_id as string | null
    if (agency_id) {
      const { data: agencyRow, error: agencyErr } = await supabase
        .from("agencies")
        .select("org_id")
        .eq("id", agency_id)
        .maybeSingle()
      if (agencyErr || !agencyRow || !(agencyRow as any).org_id) {
        return NextResponse.json({ error: "Agency inválida o sin org asociada" }, { status: 400 })
      }
      resolvedOrgId = (agencyRow as any).org_id
    }
    if (!resolvedOrgId) {
      return NextResponse.json({ error: "No se pudo resolver el org_id" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("seller_objectives")
      .insert({
        org_id: resolvedOrgId,
        agency_id: agency_id || null,
        name,
        description: description || null,
        metric_type,
        target_value,
        target_currency: target_currency || "ARS",
        reward_type,
        reward_value,
        reward_currency: reward_currency || "ARS",
        period_type: period_type || "MONTHLY",
        seller_id: seller_id || null,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating objective:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ objective: data }, { status: 201 })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in objectives POST:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// DELETE — Delete an objective
export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase: any = await createServerClient()

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID es requerido" }, { status: 400 })

    const { error } = await supabase
      .from("seller_objectives")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting objective:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in objectives DELETE:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// PATCH — Update an objective
export async function PATCH(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase: any = await createServerClient()

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: "ID es requerido" }, { status: 400 })

    const { data, error } = await supabase
      .from("seller_objectives")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating objective:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ objective: data })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in objectives PATCH:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
