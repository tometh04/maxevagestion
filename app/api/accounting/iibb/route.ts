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
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())

    // Load IIBB settings
    const { data: taxSettings } = await (supabase.from("financial_settings") as any)
      .select("iibb_jurisdiction, iibb_rate, iibb_convenio_multilateral")
      .limit(1)
      .maybeSingle()

    const iibbRate = Number(taxSettings?.iibb_rate) || 3.5
    const jurisdiction = taxSettings?.iibb_jurisdiction || "SANTA_FE"

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const endDate = `${year}-${String(month).padStart(2, "0")}-31`

    // Get all invoices issued in the period (base imponible = facturación)
    const { data: invoices } = await (supabase.from("invoices") as any)
      .select("id, imp_neto, imp_total, imp_iva, moneda, cotizacion, created_at, receptor_nombre")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .eq("status", "AUTHORIZED")

    // Get IIBB percepciones sufridas in the period (credit)
    const taxPeriod = `${year}-${String(month).padStart(2, "0")}`
    const { data: percepcionesIibb } = await (supabase.from("tax_withholdings") as any)
      .select("id, amount, currency, counterpart_name, withholding_date, notes")
      .eq("type", "PERCEPCION_IIBB")
      .eq("direction", "SUFFERED")
      .eq("tax_period", taxPeriod)

    // Get IIBB retenciones sufridas in the period (credit)
    const { data: retencionesIibb } = await (supabase.from("tax_withholdings") as any)
      .select("id, amount, currency, counterpart_name, withholding_date, notes")
      .eq("type", "RETENCION_IIBB")
      .eq("direction", "SUFFERED")
      .eq("tax_period", taxPeriod)

    // Calculate base imponible (total facturado en ARS)
    let baseImponibleARS = 0
    for (const inv of (invoices || [])) {
      const total = Number(inv.imp_total) || 0
      if (inv.moneda === "DOL" || inv.moneda === "USD") {
        baseImponibleARS += total * (Number(inv.cotizacion) || 1)
      } else {
        baseImponibleARS += total
      }
    }

    // IIBB a pagar = base × alícuota
    const iibbBruto = Math.round(baseImponibleARS * iibbRate / 100 * 100) / 100

    // Créditos (percepciones + retenciones sufridas)
    const totalPercepcionesIibb = (percepcionesIibb || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const totalRetencionesIibb = (retencionesIibb || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const totalCreditos = totalPercepcionesIibb + totalRetencionesIibb

    // Neto a pagar
    const iibbNeto = Math.max(0, iibbBruto - totalCreditos)

    return NextResponse.json({
      periodo: { year, month },
      jurisdiction,
      iibb_rate: iibbRate,
      base_imponible: Math.round(baseImponibleARS * 100) / 100,
      invoices_count: (invoices || []).length,
      iibb_bruto: iibbBruto,
      creditos: {
        percepciones_iibb: totalPercepcionesIibb,
        retenciones_iibb: totalRetencionesIibb,
        total: totalCreditos,
      },
      iibb_neto: iibbNeto,
      percepciones_detalle: percepcionesIibb || [],
      retenciones_detalle: retencionesIibb || [],
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
