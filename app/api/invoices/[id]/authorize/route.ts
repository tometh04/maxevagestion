import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { normalizeReceptorDoc } from "@/lib/afip/afip-config"
import { logSecurityEvent } from "@/lib/security/audit"
import { isCreditNote } from "@/lib/invoices/credit-note"
import {
  buildExchangeRateMap,
  getExchangeRateWithFallback,
} from "@/lib/accounting/exchange-rates"
import {
  getInvoiceSaleCurrency,
  needsMarketRate,
  sumInvoicedInSaleCurrency,
  type InvoicedRow,
} from "@/lib/invoices/currency"
import { validateIssueDate } from "@/lib/invoices/issue-date"
import { todayInArgentina } from "@/lib/utils/date-only"
import { createOrgAdminScope } from "@/lib/supabase/admin-scope"

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

    // Cross-tenant fix: filtro explícito por org, no confiar en RLS.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    const { data: invoice, error: fetchError } = await (supabase
      .from("invoices") as any)
      .select(`*, invoice_items (*)`)
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (fetchError || !invoice) {
      // 404 enmascarado: no confirmar existencia de facturas de otros orgs.
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
    // Las NC reducen lo facturado → se saltean el cap.
    //
    // VIB-151: igual que en POST /api/invoices, todo se compara en la moneda de
    // la VENTA. Con la comparación cruda, una factura en pesos sobre una venta
    // en dólares quedaba autorizada solo si el importe en ARS era menor al total
    // en USD, o sea nunca.
    if (invoice.operation_id && !isCreditNote(invoice.cbte_tipo)) {
      const { data: operation } = await (supabase.from("operations") as any)
        .select("sale_amount_total, sale_currency, currency")
        .eq("id", invoice.operation_id)
        .eq("org_id", orgId)
        .single()

      if (operation) {
        const { data: peers } = await (supabase.from("invoices") as any)
          .select("imp_total, cbte_tipo, moneda, cotizacion, fecha_emision")
          .eq("operation_id", invoice.operation_id)
          .eq("org_id", orgId)
          .eq("status", "authorized")
          .neq("id", invoice.id)

        const saleCurrency = getInvoiceSaleCurrency(operation)
        const peerRows = (peers ?? []) as InvoicedRow[]
        const selfRow: InvoicedRow = {
          imp_total: invoice.imp_total,
          cbte_tipo: invoice.cbte_tipo,
          moneda: invoice.moneda,
          cotizacion: invoice.cotizacion,
          fecha_emision: invoice.fecha_emision,
        }

        let rateFor: (date: string | null | undefined) => number | null = () => null
        if ([...peerRows, selfRow].some((row) => needsMarketRate(row, saleCurrency))) {
          const [rateMap, market] = await Promise.all([
            buildExchangeRateMap(
              supabase,
              [...peerRows.map((row) => row.fecha_emision), selfRow.fecha_emision]
            ),
            getExchangeRateWithFallback(supabase, invoice.fecha_emision || formatLocalDate(), "invoices:authorize"),
          ])
          rateFor = (date) => rateMap(date) ?? market.rate
        }

        const peersTotal = sumInvoicedInSaleCurrency({
          invoices: peerRows,
          saleCurrency,
          rateFor,
        })
        const selfTotal = sumInvoicedInSaleCurrency({
          invoices: [selfRow],
          saleCurrency,
          rateFor,
        })

        // No silenciar: sin TC no se puede saber si el tope se pasa.
        if (peersTotal.unconverted.length > 0 || selfTotal.unconverted.length > 0) {
          console.error(
            `[invoices:authorize] Sin tipo de cambio para valuar la factura ${invoice.id} contra la operación ${invoice.operation_id}`
          )
          return NextResponse.json(
            {
              error:
                "No se puede autorizar: falta el tipo de cambio para comparar la factura con el total vendido. Cargá el TC del día en Contabilidad y reintentá.",
            },
            { status: 400 }
          )
        }

        const already = peersTotal.total
        const saleTotal = Number(operation.sale_amount_total)
        const projected = already + selfTotal.total

        if (projected > saleTotal + 0.01) {
          await (supabase.from("invoices") as any)
            .update({ status: "draft" })
            .eq("id", invoice.id)
            .eq("org_id", orgId)
          const remaining = Math.round((saleTotal - already) * 100) / 100
          return NextResponse.json(
            {
              error: `No se puede autorizar: otra factura completó el total vendido mientras este draft esperaba. Restante actual: ${saleCurrency === "USD" ? "USD " : "$"}${remaining.toFixed(2)}`,
              max_remaining: remaining,
              max_remaining_currency: saleCurrency,
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

    const today = todayInArgentina()
    const fechaEmision = invoice.fecha_emision || today
    const invoiceDatePatch: Record<string, string> = {}

    if (!invoice.fecha_emision) {
      invoiceDatePatch.fecha_emision = fechaEmision
      invoice.fecha_emision = fechaEmision
    }

    // La fecha de emisión puede quedar fuera de la ventana de AFIP: o porque el
    // borrador quedó días sin autorizar, o porque se eligió una fecha anterior
    // y se autoriza tarde. AFIP lo rechaza con el error 10024; frenarlo acá
    // deja un mensaje que dice qué hacer en vez de un código.
    const issueDateCheck = validateIssueDate(fechaEmision, invoice.concepto, today)
    if (!issueDateCheck.ok) {
      return NextResponse.json(
        {
          error:
            `${issueDateCheck.error} El borrador no se puede reescribir: borralo y volvé a ` +
            `crear la factura con una fecha dentro del rango.`,
        },
        { status: 400 }
      )
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
        .eq("org_id", orgId)
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
          .eq("org_id", orgId)
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

    // Consumidor final sin identificar: normalizar DocTipo a 99 cuando DocNro=0
    // (regla AFIP 10015). Borradores viejos quedaron con DocTipo=96/DocNro=0 y
    // AFIP los rechazaba. Persistimos la corrección para que el comprobante,
    // el QR y el PDF queden consistentes con lo que emite AFIP.
    {
      const norm = normalizeReceptorDoc(invoice.cbte_tipo, invoice.receptor_doc_tipo, invoice.receptor_doc_nro)
      if (norm.docTipo !== invoice.receptor_doc_tipo || norm.docNro !== String(invoice.receptor_doc_nro ?? "")) {
        invoice.receptor_doc_tipo = norm.docTipo
        invoice.receptor_doc_nro = norm.docNro
        await (supabase.from("invoices") as any)
          .update({ receptor_doc_tipo: norm.docTipo, receptor_doc_nro: norm.docNro })
          .eq("id", id)
          .eq("org_id", orgId)
      }
    }

    // Marcar como pending
    await (supabase.from("invoices") as any).update({ status: "pending" }).eq("id", id).eq("org_id", orgId)

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
        .eq("org_id", orgId)

      // Audit log: rechazo AFIP. Útil para soporte cuando el tenant
      // pregunta "qué pasó con esta factura". Guarda CUIT, PV, tipo,
      // monto y el error literal de AFIP.
      logSecurityEvent({
        eventType: "afip_invoice_authorize_failed",
        severity: "WARN",
        actorUserId: user.id,
        actorOrgId: user.org_id ?? null,
        targetEntity: "invoice",
        targetEntityId: id,
        details: {
          cbte_tipo: invoice.cbte_tipo,
          pto_vta: invoice.pto_vta,
          imp_total: invoice.imp_total,
          receptor_doc_nro: invoice.receptor_doc_nro,
          afip_error: result.error,
          verification_status: result.verification_status,
        },
      })

      return NextResponse.json(
        {
          success: false,
          error: result.error || "Error al autorizar factura",
          verification_status: result.verification_status,
        },
        { status: 400 }
      )
    }

    // Audit log: autorización exitosa con CAE. Esta es la fila clave
    // para disputas tipo "yo no autoricé esa factura". Guarda CAE +
    // cbte_nro asignado por AFIP + actor + fecha (created_at automático).
    logSecurityEvent({
      eventType: "afip_invoice_authorized",
      severity: "INFO",
      actorUserId: user.id,
      actorOrgId: user.org_id ?? null,
      targetEntity: "invoice",
      targetEntityId: id,
      details: {
        cbte_tipo: invoice.cbte_tipo,
        pto_vta: invoice.pto_vta,
        cbte_nro: result.cbte_nro,
        cae: result.cae,
        cae_fch_vto: result.cae_fch_vto,
        imp_total: invoice.imp_total,
        receptor_doc_nro: invoice.receptor_doc_nro,
      },
    })

    // Recordar el punto de venta recién usado como predefinido de la agencia,
    // así la próxima factura lo preselecciona sin que el usuario lo elija a mano.
    // Best-effort: si falla NO debe romper una autorización ya exitosa (el CAE
    // ya existe). Se usa admin-scope validado por org porque la RLS de
    // `integrations` solo deja escribir a ADMIN/SUPER_ADMIN, y una factura puede
    // emitirla cualquier usuario con acceso a caja.
    try {
      const usedPv = Number(invoice.pto_vta)
      if (invoice.agency_id && Number.isFinite(usedPv) && usedPv >= 1 && usedPv <= 9999) {
        const scope = createOrgAdminScope(orgId)

        // Defensa en profundidad: confirmar que la agencia pertenece a esta org
        // antes de escribir con el admin client (integrations no tiene org_id).
        const { data: agencyRow } = await scope
          .from("agencies")
          .select("id")
          .eq("id", invoice.agency_id)
          .maybeSingle()

        if (agencyRow) {
          const { data: afipIntegration } = await (scope.raw
            .from("integrations") as any)
            .select("id, config")
            .eq("agency_id", invoice.agency_id)
            .eq("integration_type", "afip")
            .maybeSingle()

          if (
            afipIntegration &&
            Number(afipIntegration.config?.point_of_sale) !== usedPv
          ) {
            await (scope.raw.from("integrations") as any)
              .update({
                config: { ...(afipIntegration.config || {}), point_of_sale: usedPv },
                updated_at: new Date().toISOString(),
              })
              .eq("id", afipIntegration.id)
          }
        }
      }
    } catch (pvErr) {
      console.error(
        "[AFIP authorize] No se pudo actualizar el punto de venta predefinido:",
        pvErr
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
