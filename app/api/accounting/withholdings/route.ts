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

    // Cross-tenant fix (2026-05-18): exigir org_id.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    let query = (supabase.from("tax_withholdings") as any)
      .select(`
        *,
        operations:operation_id (id, file_code, destination),
        operators:operator_id (id, name)
      `)
      .eq("org_id", (user as any).org_id)
      .order("withholding_date", { ascending: false })

    if (taxPeriod) query = query.eq("tax_period", taxPeriod)
    if (type) query = query.eq("type", type)
    if (direction) query = query.eq("direction", direction)

    const { data: withholdings, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate totals by type AND currency
    const items = withholdings || []
    const sumByCurrency = (filtered: any[]) => ({
      ars: Math.round(filtered.filter((w: any) => w.currency !== "USD").reduce((s: number, w: any) => s + Number(w.amount), 0) * 100) / 100,
      usd: Math.round(filtered.filter((w: any) => w.currency === "USD").reduce((s: number, w: any) => s + Number(w.amount), 0) * 100) / 100,
    })

    const totals = {
      percepcion_iva: sumByCurrency(items.filter((w: any) => w.type === "PERCEPCION_IVA")),
      percepcion_iibb: sumByCurrency(items.filter((w: any) => w.type === "PERCEPCION_IIBB")),
      retencion_ganancias: sumByCurrency(items.filter((w: any) => w.type === "RETENCION_GANANCIAS")),
      retencion_iva: sumByCurrency(items.filter((w: any) => w.type === "RETENCION_IVA")),
      retencion_iibb: sumByCurrency(items.filter((w: any) => w.type === "RETENCION_IIBB")),
      total_a_favor: sumByCurrency(items.filter((w: any) => w.direction === "SUFFERED")),
      total_practicadas: sumByCurrency(items.filter((w: any) => w.direction === "PRACTICED")),
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

    // Cross-tenant fix (2026-05-18): inyectar org_id del user en el insert.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

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
        org_id: (user as any).org_id,
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
