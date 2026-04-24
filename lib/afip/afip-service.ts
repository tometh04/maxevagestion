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

  // Métodos públicos se implementan en tasks siguientes.
  // Por ahora solo el shell.
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
