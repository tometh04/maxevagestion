/**
 * AfipService: wrapper canónico sobre @afipsdk/afip.js.
 * Una instancia por request por tenant. Centraliza TODO acceso al SDK.
 *
 * Spec: docs/superpowers/specs/2026-04-24-afip-hardening-design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AfipConfig } from "./afip-config"
import { isAfipConfigValid } from "./afip-config"
import { afipRateCache } from "./rate-cache"
import { diffVoucher, type VoucherFields, type VoucherDiff } from "./diff"

type AfipSdkInstance = {
  ElectronicBilling: {
    createNextVoucher: (data: any, opts?: any) => Promise<any>
    getLastVoucher: (pv: number, cbte: number) => Promise<number>
    getVoucherInfo: (nro: number, pv: number, cbte: number) => Promise<any | null>
    getSalesPoints: () => Promise<any>
    getExchangeRate: (monId: string, date: string) => Promise<any>
  }
  RegisterScopeThirteen?: {
    getTaxpayerDetails: (cuit: number) => Promise<any>
  }
  GetServiceTA: (service: string) => Promise<any>
}

function createAfipSdkInstance(config: AfipConfig): AfipSdkInstance {
  // Evitar bundle issues con webpack — el SDK es CommonJS
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const Afip = require("@afipsdk/afip.js")
  return new Afip({
    CUIT: Number(config.cuit),
    production: config.environment === "production",
    access_token: config.api_key,
    ...(config.cert && { cert: config.cert }),
    ...(config.key && { key: config.key }),
  })
}

export interface IssueResult {
  success: boolean
  cae?: string
  cbte_nro?: number
  cae_fch_vto?: string
  verification_status: "verified" | "discrepancy" | "not_found_in_afip" | "unverified"
  diff?: VoucherDiff
  request_id?: string
  error?: string
}

export interface VerifyResult {
  verification_status: "verified" | "discrepancy" | "not_found_in_afip"
  diff?: VoucherDiff
  last_sync_at: string
}

export class AfipService {
  private afip: AfipSdkInstance

  constructor(
    private config: AfipConfig,
    private supabase: SupabaseClient,
    public readonly orgId: string
  ) {
    this.afip = createAfipSdkInstance(config)
  }

  async issueVoucher(draft: any): Promise<IssueResult> {
    const idempotencyKey = `${draft.org_id}:${draft.pto_vta}:${draft.cbte_tipo}:${draft.id}`

    const payload = this.buildAfipPayload(draft)

    // 1. Log 'create' request
    const { data: createLog } = await (this.supabase
      .from("afip_voucher_requests") as any)
      .insert({
        invoice_id: draft.id,
        org_id: draft.org_id,
        agency_id: draft.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: 1,
        operation: "create",
        request_payload: payload,
      })
      .select()
      .single()

    let createResponse: any

    try {
      createResponse = await this.afip.ElectronicBilling.createNextVoucher(payload, {
        returnFullResponse: true,
      })
    } catch (err: any) {
      // Timeout o network error — intentar recovery.
      // tentativeNumber = getLastVoucher + 1: el próximo número que AFIP
      // asignaría si procesa nuestro draft. Si getLastVoucher ahora retorna
      // ese mismo tentative, significa que AFIP lo tomó (adoptamos el CAE).
      const tentativeNumber: number | undefined = await this.afip.ElectronicBilling
        .getLastVoucher(draft.pto_vta, draft.cbte_tipo)
        .then((n: number) => n + 1)
        .catch(() => undefined)

      if (tentativeNumber === undefined) {
        await this.updateRequestLog(createLog?.id, {
          error: err?.message || String(err),
          completed_at: new Date().toISOString(),
        })
        return {
          success: false,
          verification_status: "unverified",
          error: err?.message || String(err),
        }
      }

      // Log 'recover' attempt
      await (this.supabase.from("afip_voucher_requests") as any).insert({
        invoice_id: draft.id,
        org_id: draft.org_id,
        agency_id: draft.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: 2,
        operation: "recover",
        request_payload: {
          tentative: tentativeNumber,
          pto_vta: draft.pto_vta,
          cbte_tipo: draft.cbte_tipo,
        },
      })

      const recovery = await this.recoverVoucher(
        tentativeNumber,
        draft.pto_vta,
        draft.cbte_tipo
      )

      if (recovery.adopted && recovery.voucher) {
        createResponse = {
          CAE: recovery.voucher.CodAutorizacion ?? recovery.voucher.CAE,
          CAEFchVto: recovery.voucher.CAEFchVto,
          voucherNumber: recovery.voucher.CbteDesde,
        }
      } else {
        await this.updateRequestLog(createLog?.id, {
          error: `timeout + recovery: ${JSON.stringify(recovery)}`,
          completed_at: new Date().toISOString(),
        })
        return {
          success: false,
          verification_status: "unverified",
          error: err?.message || "timeout, AFIP no tomó el comprobante",
        }
      }
    }

    if (!createResponse?.CAE) {
      return {
        success: false,
        verification_status: "unverified",
        error: "AFIP no devolvió CAE",
      }
    }

    const voucherNumber = createResponse.voucherNumber ?? createResponse.CbteDesde

    await this.updateRequestLog(createLog?.id, {
      response_payload: createResponse,
      completed_at: new Date().toISOString(),
    })

    // 2. Log 'verify' + fetch
    const { data: verifyLog } = await (this.supabase
      .from("afip_voucher_requests") as any)
      .insert({
        invoice_id: draft.id,
        org_id: draft.org_id,
        agency_id: draft.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: 1,
        operation: "verify",
      })
      .select()
      .single()

    const verified = await this.afip.ElectronicBilling.getVoucherInfo(
      voucherNumber,
      draft.pto_vta,
      draft.cbte_tipo
    )

    const sentFields: VoucherFields = {
      CAE: createResponse.CAE,
      CAEFchVto: createResponse.CAEFchVto,
      ImpTotal: draft.imp_total,
      ImpNeto: draft.imp_neto,
      ImpIVA: draft.imp_iva,
      DocNro: Number(draft.receptor_doc_nro),
      DocTipo: draft.receptor_doc_tipo,
      CbteFch: this.formatDate(draft.fecha_emision),
      CbteDesde: voucherNumber,
      CbteHasta: voucherNumber,
    }

    const receivedFields: Partial<VoucherFields> | null = verified
      ? {
          CAE: verified.CodAutorizacion ?? verified.CAE,
          CAEFchVto: verified.CAEFchVto,
          ImpTotal: verified.ImpTotal,
          ImpNeto: verified.ImpNeto,
          ImpIVA: verified.ImpIVA,
          DocNro: verified.DocNro,
          DocTipo: verified.DocTipo,
          CbteFch: verified.CbteFch,
          CbteDesde: verified.CbteDesde,
          CbteHasta: verified.CbteHasta,
        }
      : null

    const diff = diffVoucher(sentFields, receivedFields)

    const verificationStatus: IssueResult["verification_status"] =
      diff === null
        ? "verified"
        : diff && (diff as any)._not_found
        ? "not_found_in_afip"
        : "discrepancy"

    await this.updateRequestLog(verifyLog?.id, {
      verified_payload: verified,
      verification_diff: diff,
      completed_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
    })

    // 3. Update invoice
    await (this.supabase.from("invoices") as any)
      .update({
        cae: createResponse.CAE,
        cae_fch_vto: createResponse.CAEFchVto,
        cbte_nro: voucherNumber,
        status: "authorized",
        verification_status: verificationStatus,
        verified_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", draft.id)

    return {
      success: true,
      cae: createResponse.CAE,
      cbte_nro: voucherNumber,
      cae_fch_vto: createResponse.CAEFchVto,
      verification_status: verificationStatus,
      diff,
      request_id: createLog?.id,
    }
  }

  private async updateRequestLog(id: string | undefined, patch: any): Promise<void> {
    if (!id) return
    await (this.supabase.from("afip_voucher_requests") as any)
      .update(patch)
      .eq("id", id)
  }

  private async recoverVoucher(
    tentativeNumber: number,
    ptoVta: number,
    cbteTipo: number
  ): Promise<{
    adopted: boolean
    canRetry?: boolean
    anomaly?: boolean
    note?: string
    voucher?: any
  }> {
    const last = await this.afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo)

    if (last === tentativeNumber) {
      const voucher = await this.afip.ElectronicBilling.getVoucherInfo(
        last, ptoVta, cbteTipo
      )
      return { adopted: true, voucher }
    }
    if (last === tentativeNumber - 1) {
      return { adopted: false, canRetry: true }
    }
    if (last < tentativeNumber - 1) {
      return { adopted: false, canRetry: true, note: "stale-tentative" }
    }
    // last > tentative (including > tentative + 1) is anomaly
    return { adopted: false, anomaly: true }
  }

  private buildAfipPayload(draft: any): any {
    const items = draft.invoice_items || []
    const isFacturaC = [11, 12, 13].includes(draft.cbte_tipo)

    let ivaArray: any[] = []
    if (!isFacturaC) {
      const ivaGrouped: Record<number, { BaseImp: number; Importe: number }> = {}
      for (const item of items) {
        if (item.tax_treatment !== "GRAVADO" && item.iva_porcentaje === 0) continue
        const id = item.iva_id
        if (!ivaGrouped[id]) ivaGrouped[id] = { BaseImp: 0, Importe: 0 }
        ivaGrouped[id].BaseImp += item.subtotal
        ivaGrouped[id].Importe += item.iva_importe
      }
      ivaArray = Object.entries(ivaGrouped).map(([id, v]) => ({
        Id: parseInt(id, 10),
        BaseImp: Math.round(v.BaseImp * 100) / 100,
        Importe: Math.round(v.Importe * 100) / 100,
      }))
    }

    const payload: any = {
      CantReg: 1,
      PtoVta: draft.pto_vta,
      CbteTipo: draft.cbte_tipo,
      Concepto: draft.concepto,
      DocTipo: draft.receptor_doc_tipo,
      DocNro: parseInt(String(draft.receptor_doc_nro).replace(/\D/g, ""), 10),
      CbteFch: parseInt(this.formatDate(draft.fecha_emision || new Date()), 10),
      ImpTotal: draft.imp_total,
      ImpTotConc: draft.imp_tot_conc || 0,
      ImpNeto: isFacturaC ? draft.imp_total : draft.imp_neto,
      ImpOpEx: draft.imp_op_ex || 0,
      ImpIVA: isFacturaC ? 0 : draft.imp_iva,
      ImpTrib: draft.imp_trib || 0,
      MonId: draft.moneda || "PES",
      MonCotiz: draft.cotizacion || 1,
      CondicionIVAReceptorId: draft.receptor_condicion_iva || 5,
    }
    if (ivaArray.length > 0) payload.Iva = ivaArray

    if (draft.concepto === 2 || draft.concepto === 3) {
      payload.FchServDesde = this.formatDate(draft.fch_serv_desde)
      payload.FchServHasta = this.formatDate(draft.fch_serv_hasta)
      payload.FchVtoPago = this.formatDate(draft.fch_vto_pago || draft.fch_serv_hasta)
    }

    return payload
  }

  private formatDate(input: string | Date): string {
    if (typeof input === "string") {
      // Formato ISO corto YYYY-MM-DD: evitar parseo UTC que desplaza día por TZ.
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input)
      if (m) return `${m[1]}${m[2]}${m[3]}`
    }
    const d = typeof input === "string" ? new Date(input) : input
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}${mo}${day}`
  }
}

/**
 * Factory: construye un AfipService para un org específico, leyendo la
 * config desde la tabla integrations. Retorna null si no hay config.
 *
 * Respeta RLS: si el user no tiene acceso al org, la query devuelve null.
 */
export async function getAfipServiceForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<AfipService | null> {
  const { data: integration } = await (supabase
    .from("integrations") as any)
    .select("*")
    .eq("org_id", orgId)
    .eq("integration_type", "afip")
    .eq("status", "active")
    .maybeSingle()

  if (!integration || !integration.config) {
    return null
  }

  const config = integration.config as Partial<AfipConfig>
  if (!isAfipConfigValid(config)) {
    return null
  }

  return new AfipService(config as AfipConfig, supabase, orgId)
}
