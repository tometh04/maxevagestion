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
import { getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { isCreditOrDebitNote } from "@/lib/invoices/credit-note"

type AfipSdkInstance = {
  ElectronicBilling: {
    createNextVoucher: (data: any, opts?: any) => Promise<any>
    getLastVoucher: (pv: number, cbte: number) => Promise<number>
    getVoucherInfo: (nro: number, pv: number, cbte: number) => Promise<any | null>
    getSalesPoints: () => Promise<any>
    getExchangeRate?: (monId: string, date: string) => Promise<any>
    executeRequest?: (operation: string, params?: any) => Promise<any>
  }
  RegisterScopeThirteen?: {
    getTaxpayerDetails: (cuit: number) => Promise<any>
  }
  GetServiceTA: (service: string) => Promise<any>
}

function createAfipSdkInstance(config: AfipConfig): AfipSdkInstance {
  // Evitar bundle issues con webpack — el SDK es CommonJS
  // eslint-disable-next-line
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
      CbteFch: this.formatDate(draft.fecha_emision || new Date()),
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

  async verifyVoucher(invoiceId: string): Promise<VerifyResult> {
    const { data: inv } = await (this.supabase
      .from("invoices") as any)
      .select("*")
      .eq("id", invoiceId)
      .single()

    if (!inv) {
      throw new Error(`Invoice ${invoiceId} not found or not accessible`)
    }
    if (!inv.cbte_nro) {
      throw new Error(`Invoice ${invoiceId} has no cbte_nro — not yet authorized`)
    }

    const idempotencyKey = `${inv.org_id}:${inv.pto_vta}:${inv.cbte_tipo}:${inv.id}`

    const { data: verifyLog } = await (this.supabase
      .from("afip_voucher_requests") as any)
      .insert({
        invoice_id: invoiceId,
        org_id: inv.org_id,
        agency_id: inv.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: Date.now(), // secuencial único por on-demand verify
        operation: "verify",
      })
      .select()
      .single()

    const verified = await this.afip.ElectronicBilling.getVoucherInfo(
      inv.cbte_nro,
      inv.pto_vta,
      inv.cbte_tipo
    )

    const sentFields: VoucherFields = {
      CAE: inv.cae,
      CAEFchVto: inv.cae_fch_vto || "",
      ImpTotal: inv.imp_total,
      ImpNeto: inv.imp_neto,
      ImpIVA: inv.imp_iva,
      DocNro: Number(inv.receptor_doc_nro),
      DocTipo: inv.receptor_doc_tipo,
      CbteFch: this.formatDate(inv.fecha_emision || new Date()),
      CbteDesde: inv.cbte_nro,
      CbteHasta: inv.cbte_nro,
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
    const verification_status: VerifyResult["verification_status"] =
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

    const now = new Date().toISOString()
    await (this.supabase.from("invoices") as any)
      .update({
        verification_status,
        verified_at: now,
        last_sync_at: now,
      })
      .eq("id", invoiceId)

    return { verification_status, diff: diff ?? undefined, last_sync_at: now }
  }

  async getAfipRate(currency: "DOL" | "PES", date?: Date): Promise<number> {
    if (currency === "PES") return 1

    const d = date ?? new Date()
    const dateStr = this.formatDate(d)
    const cacheKey = `${currency}:${dateStr}`

    const cached = afipRateCache.get(cacheKey)
    if (cached !== undefined) return cached

    let response: any = null

    if (typeof this.afip.ElectronicBilling.getExchangeRate === "function") {
      response = await this.afip.ElectronicBilling.getExchangeRate(currency, dateStr)
    } else if (typeof this.afip.ElectronicBilling.executeRequest === "function") {
      response = await this.afip.ElectronicBilling.executeRequest("FEParamGetCotizacion", {
        MonId: currency,
      })
    }

    const result = response?.ResultGet ?? response
    const rate =
      typeof result === "number"
        ? result
        : Number(result?.MonCotiz ?? result?.cotizacion ?? 0)

    if (!rate || rate <= 0) {
      const fallback = await getExchangeRateWithFallback(
        this.supabase as any,
        d,
        `afip-rate-${this.orgId}-${currency}`
      )
      afipRateCache.set(cacheKey, fallback.rate)
      return fallback.rate
    }

    afipRateCache.set(cacheKey, rate)
    return rate
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

    // NC/ND: AFIP exige CbtesAsoc (comprobante asociado) o rechaza el voucher
    // (errores típicos 10016/10048). El comprobante asociado se guarda en las
    // columnas cbte_asoc_* al crear el draft de la NC/ND.
    if (isCreditOrDebitNote(draft.cbte_tipo) && draft.cbte_asoc_tipo) {
      const asoc: any = {
        Tipo: draft.cbte_asoc_tipo,
        PtoVta: draft.cbte_asoc_pto_vta,
        Nro: draft.cbte_asoc_nro,
      }
      if (draft.cbte_asoc_cuit) asoc.Cuit = Number(draft.cbte_asoc_cuit)
      if (draft.cbte_asoc_fch) asoc.CbteFch = parseInt(String(draft.cbte_asoc_fch), 10)
      payload.CbtesAsoc = [asoc]
    }

    if (draft.concepto === 2 || draft.concepto === 3) {
      const serviceFrom = draft.fch_serv_desde || draft.fecha_emision || new Date()
      const serviceTo = draft.fch_serv_hasta || serviceFrom

      // Bug fix 2026-05-06: AFIP error 10036 — "FchVtoPago no puede ser
      // anterior a la fecha del comprobante". Caso real: facturación
      // retroactiva de un viaje ya finalizado. Antes usábamos `serviceTo`
      // como fallback de paymentDue, lo cual es un fecha pasada cuando
      // se factura post-trip. Ahora clampeamos al cbteFch (fecha de
      // emisión, que el comprobante usa como CbteFch en AFIP).
      const cbteFch = draft.fecha_emision || new Date()
      const cbteFchTime = (cbteFch instanceof Date ? cbteFch : new Date(cbteFch)).getTime()
      let paymentDue: string | Date = draft.fecha_vto_pago || serviceTo
      const paymentDueTime = (paymentDue instanceof Date ? paymentDue : new Date(paymentDue)).getTime()
      if (Number.isFinite(paymentDueTime) && Number.isFinite(cbteFchTime) && paymentDueTime < cbteFchTime) {
        paymentDue = cbteFch
      }

      payload.FchServDesde = this.formatDate(serviceFrom)
      payload.FchServHasta = this.formatDate(serviceTo)
      payload.FchVtoPago = this.formatDate(paymentDue)
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
  // Una org puede tener múltiples integraciones AFIP (una por agencia).
  // Todas comparten el mismo CUIT + cert — cualquiera sirve para detectar
  // "hay AFIP configurado" y obtener el CUIT emisor. Si hay múltiples,
  // tomamos la primera activa.
  const { data: integrations } = await (supabase
    .from("integrations") as any)
    .select("*")
    .eq("org_id", orgId)
    .eq("integration_type", "afip")
    .eq("status", "active")
    .limit(1)

  const integration = integrations?.[0]
  if (!integration || !integration.config) {
    return null
  }

  const config = integration.config as Partial<AfipConfig>
  if (!isAfipConfigValid(config)) {
    return null
  }

  return new AfipService(config as AfipConfig, supabase, orgId)
}
