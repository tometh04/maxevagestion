import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const taxPeriod = searchParams.get("period") // "2026-03"
    const type = searchParams.get("type") // PERCEPCION_IVA, PERCEPCION_IIBB, etc
    const direction = searchParams.get("direction") // SUFFERED, PRACTICED

    let query = (supabase.from("tax_withholdings") as any)
      .select(`
        *,
        operations:operation_id (id, file_code, destination),
        operators:operator_id (id, name)
      `)
      .order("withholding_date", { ascending: false })

    if (taxPeriod) query = query.eq("tax_period", taxPeriod)
    if (type) query = query.eq("type", type)
    if (direction) query = query.eq("direction", direction)

    const { data: withholdings, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate totals by type
    const items = withholdings || []
    const totals = {
      percepcion_iva: items.filter((w: any) => w.type === "PERCEPCION_IVA").reduce((s: number, w: any) => s + Number(w.amount), 0),
      percepcion_iibb: items.filter((w: any) => w.type === "PERCEPCION_IIBB").reduce((s: number, w: any) => s + Number(w.amount), 0),
      retencion_ganancias: items.filter((w: any) => w.type === "RETENCION_GANANCIAS").reduce((s: number, w: any) => s + Number(w.amount), 0),
      retencion_iva: items.filter((w: any) => w.type === "RETENCION_IVA").reduce((s: number, w: any) => s + Number(w.amount), 0),
      retencion_iibb: items.filter((w: any) => w.type === "RETENCION_IIBB").reduce((s: number, w: any) => s + Number(w.amount), 0),
      total_a_favor: items.filter((w: any) => w.direction === "SUFFERED").reduce((s: number, w: any) => s + Number(w.amount), 0),
      total_practicadas: items.filter((w: any) => w.direction === "PRACTICED").reduce((s: number, w: any) => s + Number(w.amount), 0),
    }

    return NextResponse.json({ withholdings: items, totals })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST — Create a manual withholding (bank perception, manual entry)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { data, error } = await (supabase.from("tax_withholdings") as any)
      .insert({
        type: body.type,
        direction: body.direction || "SUFFERED",
        source_type: body.source_type || "MANUAL",
        source_id: body.source_id || null,
        operation_id: body.operation_id || null,
        operator_id: body.operator_id || null,
        counterpart_cuit: body.counterpart_cuit || null,
        counterpart_name: body.counterpart_name || null,
        currency: body.currency || "ARS",
        amount: Number(body.amount),
        tax_period: body.tax_period || new Date().toISOString().substring(0, 7),
        withholding_date: body.withholding_date || new Date().toISOString().split("T")[0],
        status: "PENDING",
        notes: body.notes || null,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ withholding: data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
