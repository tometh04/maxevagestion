import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf"
import JSZip from "jszip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_INVOICES = 500
const CONCURRENCY = 5

/**
 * GET /api/invoices/export?from=YYYY-MM-DD&to=YYYY-MM-DD&cbte_tipo=6&status=authorized
 *
 * Descarga ZIP con PDFs de las facturas del tenant (RLS) que matchean los
 * filtros. Max 500 por request. Default status='authorized'.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getCurrentUser()
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const sp = request.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    const cbteTipoParam = sp.get("cbte_tipo")
    const statusParam = sp.get("status") ?? "authorized"

    if (!from || !to) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos: from y to (YYYY-MM-DD)" },
        { status: 400 }
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { error: "Formato de fecha inválido. Usá YYYY-MM-DD" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    // Query con RLS automático por org_id
    let query = (supabase.from("invoices") as any)
      .select("*, invoice_items (*)", { count: "exact" })
      .gte("fecha_emision", from)
      .lte("fecha_emision", to)
      .eq("status", statusParam)
      .order("cbte_nro", { ascending: true })
      .limit(MAX_INVOICES + 1)

    if (cbteTipoParam) {
      query = query.eq("cbte_tipo", parseInt(cbteTipoParam, 10))
    }

    const { data: invoices, count, error } = await query

    if (error) {
      console.error("Error fetching invoices for export:", error)
      return NextResponse.json({ error: "Error al consultar facturas" }, { status: 500 })
    }

    const invoicesList: any[] = invoices ?? []
    if (invoicesList.length === 0) {
      return NextResponse.json({ error: "No hay facturas con esos filtros" }, { status: 400 })
    }

    if (invoicesList.length > MAX_INVOICES || (typeof count === "number" && count > MAX_INVOICES)) {
      return NextResponse.json(
        {
          error: `Demasiadas facturas (${count ?? invoicesList.length}). Reduce el rango de fechas o agregá filtros. Máximo ${MAX_INVOICES} por descarga.`,
        },
        { status: 400 }
      )
    }

    // Batch fetch agencies (para nombre emisor)
    const agencyIds = Array.from(new Set(invoicesList.map((i) => i.agency_id).filter(Boolean)))
    const { data: agencies } = await (supabase.from("agencies") as any)
      .select("id, name, org_id")
      .in("id", agencyIds)
    const agencyById = new Map((agencies ?? []).map((a: any) => [a.id, a]))

    // Batch fetch AFIP configs por org_id (typically 1 org per user)
    const orgIds = Array.from(new Set(invoicesList.map((i) => i.org_id)))
    const afipCuitByOrg = new Map<string, string>()
    for (const orgId of orgIds) {
      const svc = await getAfipServiceForOrg(supabase, orgId)
      afipCuitByOrg.set(orgId, (svc as any)?.config?.cuit ?? "")
    }

    // Footer company name (unique per org)
    const { data: orgSettings } = await (supabase.from("organization_settings") as any).select("key, value")
    const footerCompanyName = orgSettings?.find((s: any) => s.key === "company_name")?.value

    // Promise pool (concurrency=5) para render paralelo
    const zip = new JSZip()
    const errors: Array<{ id: string; error: string }> = []

    for (let i = 0; i < invoicesList.length; i += CONCURRENCY) {
      const batch = invoicesList.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map(async (inv) => {
          try {
            const agency: any = agencyById.get(inv.agency_id)
            const emisorCuit = afipCuitByOrg.get(inv.org_id) ?? ""
            const pdfBytes = await renderInvoicePdf({
              invoice: inv,
              emisor: { cuit: emisorCuit, razonSocial: agency?.name ?? "" },
              agency: { name: agency?.name ?? "Agencia" },
              footerCompanyName,
            })
            const pv = String(inv.pto_vta).padStart(4, "0")
            const nro = String(inv.cbte_nro ?? 0).padStart(8, "0")
            zip.file(`factura-${pv}-${nro}.pdf`, pdfBytes)
          } catch (err: any) {
            errors.push({ id: inv.id, error: err?.message ?? String(err) })
          }
        })
      )
    }

    if (errors.length > 0 && zip.files && Object.keys(zip.files).length === 0) {
      // Todas fallaron
      return NextResponse.json(
        { error: "No se pudo generar ninguna factura", details: errors.slice(0, 5) },
        { status: 500 }
      )
    }

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })

    return new NextResponse(Buffer.from(zipBytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="facturas-${from}-${to}.zip"`,
        ...(errors.length > 0 ? { "X-Export-Partial-Errors": String(errors.length) } : {}),
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/invoices/export:", error)
    return NextResponse.json(
      { error: error.message || "Error al exportar facturas" },
      { status: 500 }
    )
  }
}
