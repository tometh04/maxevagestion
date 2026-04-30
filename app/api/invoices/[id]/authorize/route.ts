import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function formatLocalDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00`)
}

/**
 * POST /api/invoices/[id]/authorize
 *
 * Autoriza una factura contra AFIP via AfipService.
 * - Valida tenant access via RLS (la query fetch no devuelve si no tiene acceso)
 * - Pre-check de cotización USD contra oficial AFIP (±2% rule)
 * - Delega a AfipService.issueVoucher (que hace create + verify + log)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para autorizar facturas" },
        { status: 403 }
      )
    }

    // RLS scope: si el user no pertenece al org de la factura, no la encuentra
    const { data: invoice, error: fetchError } = await (supabase
      .from("invoices") as any)
      .select(`*, invoice_items (*)`)
      .eq("id", id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    if (invoice.status !== "draft" && invoice.status !== "pending") {
      return NextResponse.json(
        { error: `No se puede autorizar una factura en estado '${invoice.status}'` },
        { status: 400 }
      )
    }

    // Re-check total sold cap (race-safe: otro POST podría haber completado
    // mientras esta factura estaba en draft/pending). La facturación de
    // operaciones debe cubrir el total vendido, no solo el margen.
    if (invoice.operation_id) {
      const { data: operation } = await (supabase.from("operations") as any)
        .select("sale_amount_total")
        .eq("id", invoice.operation_id)
        .single()

      if (operation) {
        const { data: peers } = await (supabase.from("invoices") as any)
          .select("imp_total")
          .eq("operation_id", invoice.operation_id)
          .eq("status", "authorized")
          .neq("id", invoice.id)

        const already = (peers ?? []).reduce(
          (acc: number, i: any) => acc + Number(i.imp_total),
          0
        )
        const saleTotal = Number(operation.sale_amount_total)
        const projected = already + Number(invoice.imp_total)

        if (projected > saleTotal + 0.01) {
          await (supabase.from("invoices") as any)
            .update({ status: "draft" })
            .eq("id", invoice.id)
          return NextResponse.json(
            {
              error: `No se puede autorizar: otra factura completó el total vendido mientras este draft esperaba. Restante actual: $${(saleTotal - already).toFixed(2)}`,
              max_remaining: saleTotal - already,
            },
            { status: 400 }
          )
        }
      }
    }

    const afipService = await getAfipServiceForOrg(supabase, invoice.org_id)
    if (!afipService) {
      return NextResponse.json(
        { error: "AFIP no configurado para esta organización. Configure en Integraciones." },
        { status: 400 }
      )
    }

    const fechaEmision = invoice.fecha_emision || formatLocalDate()
    const invoiceDatePatch: Record<string, string> = {}

    if (!invoice.fecha_emision) {
      invoiceDatePatch.fecha_emision = fechaEmision
      invoice.fecha_emision = fechaEmision
    }

    if (invoice.concepto === 2 || invoice.concepto === 3) {
      const fchServDesde = invoice.fch_serv_desde || fechaEmision
      const fchServHasta = invoice.fch_serv_hasta || fchServDesde
      const fechaVtoPago = invoice.fecha_vto_pago || fchServHasta

      if (!invoice.fch_serv_desde) invoiceDatePatch.fch_serv_desde = fchServDesde
      if (!invoice.fch_serv_hasta) invoiceDatePatch.fch_serv_hasta = fchServHasta
      if (!invoice.fecha_vto_pago) invoiceDatePatch.fecha_vto_pago = fechaVtoPago

      invoice.fch_serv_desde = fchServDesde
      invoice.fch_serv_hasta = fchServHasta
      invoice.fecha_vto_pago = fechaVtoPago
    }

    if (Object.keys(invoiceDatePatch).length > 0) {
      await (supabase.from("invoices") as any)
        .update(invoiceDatePatch)
        .eq("id", invoice.id)
    }

    // Pre-check de cotización USD
    if (invoice.moneda === "DOL") {
      const oficial = await afipService.getAfipRate("DOL", parseLocalDate(invoice.fecha_emision))
      const user_rate = Number(invoice.cotizacion) || 0

      if (!user_rate || user_rate <= 1) {
        // Si no hay cotización cargada, usar oficial
        await (supabase.from("invoices") as any)
          .update({ cotizacion: oficial })
          .eq("id", id)
        invoice.cotizacion = oficial
      } else {
        const delta = Math.abs(user_rate - oficial) / oficial
        if (delta > 0.02) {
          return NextResponse.json(
            {
              error: `Cotización fuera del ±2% oficial AFIP. AFIP va a rechazar (error 10119).`,
              suggested_rate: oficial,
              your_rate: user_rate,
              diff_pct: (delta * 100).toFixed(2),
            },
            { status: 400 }
          )
        }
      }
    }

    // Marcar como pending
    await (supabase.from("invoices") as any).update({ status: "pending" }).eq("id", id)

    // Emitir via service
    const result = await afipService.issueVoucher(invoice)

    if (!result.success) {
      await (supabase.from("invoices") as any)
        .update({
          status: "draft",
          verification_status: result.verification_status || "unverified",
          afip_response: {
            success: false,
            error: result.error || "Error al autorizar factura",
            verification_status: result.verification_status || "unverified",
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", id)
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Error al autorizar factura",
          verification_status: result.verification_status,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Factura autorizada",
      data: {
        cae: result.cae,
        cae_fch_vto: result.cae_fch_vto,
        cbte_nro: result.cbte_nro,
        verification_status: result.verification_status,
        diff: result.diff,
        request_id: result.request_id,
      },
    })
  } catch (error: any) {
    console.error("Error in POST /api/invoices/[id]/authorize:", error)
    return NextResponse.json(
      { error: error.message || "Error al autorizar factura" },
      { status: 500 }
    )
  }
}
