import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAgencyAfipConfig } from "@/lib/afip/afip-client"

export const dynamic = 'force-dynamic'

// GET - Testear conexión AFIP paso a paso
export async function GET(request: Request) {
  const steps: Array<{ step: string; status: string; data?: any; error?: string }> = []

  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    let agencyId = searchParams.get("agencyId")

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Si no se pasa agencyId, buscar la primera agencia con AFIP configurado
    if (!agencyId) {
      const { data: configs } = await supabase
        .from('afip_config')
        .select('agency_id')
        .eq('is_active', true)
        .in('agency_id', agencyIds)
        .limit(1)
      agencyId = configs?.[0]?.agency_id || agencyIds[0]
    }

    if (!agencyId || !agencyIds.includes(agencyId)) {
      return NextResponse.json({ error: "No tiene agencias con acceso" }, { status: 403 })
    }

    steps.push({ step: "0_agency", status: "ok", data: { agencyId } })

    // Step 1: Obtener config de BD
    steps.push({ step: "1_get_config", status: "running" })
    const afipConfig = await getAgencyAfipConfig(supabase, agencyId)
    if (!afipConfig) {
      steps[steps.length - 1] = { step: "1_get_config", status: "error", error: "No hay config AFIP para esta agencia" }
      return NextResponse.json({ steps })
    }
    steps[steps.length - 1] = { step: "1_get_config", status: "ok", data: { cuit: afipConfig.cuit, environment: afipConfig.environment } }

    // Step 2: Crear instancia SDK
    steps.push({ step: "2_create_sdk_instance", status: "running" })
    const Afip = require('@afipsdk/afip.js')
    const apiKey = process.env.AFIP_SDK_API_KEY || ''
    const isProd = afipConfig.environment === 'production' || afipConfig.environment === 'prod'
    const afip = new Afip({
      CUIT: afipConfig.cuit,
      production: isProd,
      access_token: apiKey,
    })
    steps[steps.length - 1] = {
      step: "2_create_sdk_instance",
      status: "ok",
      data: { cuit: afipConfig.cuit, production: isProd, api_key_length: apiKey.length, api_key_prefix: apiKey.substring(0, 8) }
    }

    // Step 3: Obtener Token/Sign (v1/afip/auth)
    steps.push({ step: "3_get_token_auth", status: "running" })
    try {
      const ta = await afip.GetServiceTA('wsfe')
      steps[steps.length - 1] = {
        step: "3_get_token_auth",
        status: "ok",
        data: { token_length: ta?.token?.length || 0, sign_length: ta?.sign?.length || 0 }
      }
    } catch (authError: any) {
      steps[steps.length - 1] = {
        step: "3_get_token_auth",
        status: "error",
        error: authError.message,
        data: { errorData: authError?.data, errorStatus: authError?.status }
      }
      return NextResponse.json({ steps })
    }

    // Step 4: getLastVoucher
    steps.push({ step: "4_get_last_voucher", status: "running" })
    try {
      const lastVoucher = await afip.ElectronicBilling.getLastVoucher(1, 11)
      steps[steps.length - 1] = {
        step: "4_get_last_voucher",
        status: "ok",
        data: { lastVoucher, ptoVta: 1, cbteTipo: 11 }
      }
    } catch (lvError: any) {
      steps[steps.length - 1] = {
        step: "4_get_last_voucher",
        status: "error",
        error: lvError.message,
        data: { errorData: lvError?.data, errorStatus: lvError?.status }
      }
      return NextResponse.json({ steps })
    }

    // Step 5: FEDummy (server status)
    steps.push({ step: "5_server_status", status: "running" })
    try {
      const serverStatus = await afip.ElectronicBilling.getServerStatus()
      steps[steps.length - 1] = { step: "5_server_status", status: "ok", data: serverStatus }
    } catch (ssError: any) {
      steps[steps.length - 1] = {
        step: "5_server_status",
        status: "error",
        error: ssError.message,
        data: { errorData: ssError?.data, errorStatus: ssError?.status }
      }
    }

    return NextResponse.json({ steps, allOk: steps.every(s => s.status === "ok") })
  } catch (error: any) {
    steps.push({ step: "unexpected_error", status: "error", error: error.message })
    return NextResponse.json({ steps }, { status: 500 })
  }
}
