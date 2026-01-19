import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { canAccessModule } from "@/lib/permissions"
import { 
  createInvoice, 
  formatDate,
} from "@/lib/afip/afip-client"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { TipoComprobante, TipoDocumento, TipoIVA, IVA_PORCENTAJES } from "@/lib/afip/types"

export const dynamic = 'force-dynamic'

// POST - Autorizar factura en AFIP
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para autorizar facturas" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Obtener factura con items
    const { data: invoice, error: fetchError } = await (supabase.from("invoices") as any)
      .select(`
        *,
        invoice_items (*)
      `)
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json(
        { error: "Factura no encontrada" },
        { status: 404 }
      )
    }

    // Obtener configuración de AFIP para la agencia de la factura
    const afipConfig = await getAfipConfigForAgency(supabase, invoice.agency_id)
    
    if (!afipConfig) {
      return NextResponse.json(
        { error: "AFIP no está configurado para esta agencia. Configure la integración en Configuración → Integraciones." },
        { status: 400 }
      )
    }

    // Verificar que la factura está en estado válido
    if (invoice.status !== 'draft' && invoice.status !== 'pending') {
      return NextResponse.json(
        { error: `No se puede autorizar una factura en estado '${invoice.status}'` },
        { status: 400 }
      )
    }

    // Actualizar estado a pending
    await (supabase.from("invoices") as any)
      .update({ status: 'pending' })
      .eq("id", id)

    // Preparar datos para AFIP
    const items = invoice.invoice_items || []
    
    // Agrupar IVA por alícuota
    const ivaGrouped: Record<number, { BaseImp: number; Importe: number }> = {}
    
    for (const item of items) {
      const ivaId = item.iva_id as TipoIVA
      if (!ivaGrouped[ivaId]) {
        ivaGrouped[ivaId] = { BaseImp: 0, Importe: 0 }
      }
      ivaGrouped[ivaId].BaseImp += item.subtotal
      ivaGrouped[ivaId].Importe += item.iva_importe
    }

    const ivaArray = Object.entries(ivaGrouped).map(([id, values]) => ({
      Id: parseInt(id, 10) as TipoIVA,
      BaseImp: Math.round(values.BaseImp * 100) / 100,
      Importe: Math.round(values.Importe * 100) / 100,
    }))

    // Crear request para AFIP
    const afipRequest = {
      CbteTipo: invoice.cbte_tipo as TipoComprobante,
      PtoVta: invoice.pto_vta,
      Concepto: invoice.concepto as 1 | 2 | 3,
      DocTipo: invoice.receptor_doc_tipo as TipoDocumento,
      DocNro: parseInt(invoice.receptor_doc_nro.replace(/\D/g, ''), 10),
      CbteFch: invoice.fecha_emision 
        ? formatDate(new Date(invoice.fecha_emision))
        : formatDate(new Date()),
      ImpTotal: invoice.imp_total,
      ImpTotConc: invoice.imp_tot_conc || 0,
      ImpNeto: invoice.imp_neto,
      ImpOpEx: invoice.imp_op_ex || 0,
      ImpIVA: invoice.imp_iva,
      ImpTrib: invoice.imp_trib || 0,
      MonId: invoice.moneda || 'PES',
      MonCotiz: invoice.cotizacion || 1,
      Iva: ivaArray.length > 0 ? ivaArray : undefined,
      FchServDesde: invoice.fch_serv_desde,
      FchServHasta: invoice.fch_serv_hasta,
      FchVtoPago: invoice.fecha_vto_pago 
        ? formatDate(new Date(invoice.fecha_vto_pago))
        : undefined,
    }

    // Enviar a AFIP usando la configuración de la agencia
    const afipResponse = await createInvoice(afipConfig, afipRequest)

    if (afipResponse.success && afipResponse.data?.CAE) {
      // Éxito: actualizar factura
      const { error: updateError } = await (supabase.from("invoices") as any)
        .update({
          status: 'authorized',
          cbte_nro: afipResponse.data.CbteDesde,
          cae: afipResponse.data.CAE,
          cae_fch_vto: afipResponse.data.CAEFchVto,
          fecha_emision: new Date().toISOString().split('T')[0],
          afip_response: afipResponse.data,
        })
        .eq("id", id)

      if (updateError) {
        console.error("Error updating invoice after AFIP:", updateError)
      }

      return NextResponse.json({
        success: true,
        message: "Factura autorizada correctamente",
        data: {
          cae: afipResponse.data.CAE,
          cae_fch_vto: afipResponse.data.CAEFchVto,
          cbte_nro: afipResponse.data.CbteDesde,
        },
      })
    } else {
      // Error: actualizar estado y guardar respuesta
      await (supabase.from("invoices") as any)
        .update({
          status: 'rejected',
          afip_response: afipResponse,
        })
        .eq("id", id)

      return NextResponse.json(
        {
          success: false,
          error: afipResponse.error || "Error al autorizar factura en AFIP",
          details: afipResponse.data?.Errores,
        },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("Error in POST /api/invoices/[id]/authorize:", error)
    return NextResponse.json(
      { error: error.message || "Error al autorizar factura" },
      { status: 500 }
    )
  }
}
