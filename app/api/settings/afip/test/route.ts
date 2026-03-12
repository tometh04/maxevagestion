import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
      const { data: configs } = await (supabase as any)
        .from('integrations')
        .select('agency_id')
        .eq('integration_type', 'afip')
        .eq('status', 'active')
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
    const afipConfig = await getAfipConfigForAgency(supabase, agencyId)
    if (!afipConfig) {
      steps[steps.length - 1] = { step: "1_get_config", status: "error", error: "No hay config AFIP para esta agencia" }
      return NextResponse.json({ steps })
    }
    steps[steps.length - 1] = { step: "1_get_config", status: "ok", data: { cuit: afipConfig.cuit, environment: afipConfig.environment } }

    // Step 2: Crear instancia SDK
    steps.push({ step: "2_create_sdk_instance", status: "running" })
    const Afip = eval('require')('@afipsdk/afip.js')
    const apiKey = process.env.AFIP_SDK_API_KEY || afipConfig.api_key || ''
    const isProd = afipConfig.environment === 'production'
    const afip = new Afip({
      CUIT: Number(afipConfig.cuit),
      production: isProd,
      access_token: apiKey,
      ...(afipConfig.cert && { cert: afipConfig.cert }),
      ...(afipConfig.key && { key: afipConfig.key }),
    })
    steps[steps.length - 1] = {
      step: "2_create_sdk_instance",
      status: "ok",
      data: { cuit: afipConfig.cuit, production: isProd, has_cert: !!(afipConfig.cert), has_key: !!(afipConfig.key) }
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

    // Step 4: getLastVoucher (usar el PV configurado)
    steps.push({ step: "4_get_last_voucher", status: "running" })
    try {
      const ptoVta = afipConfig.point_of_sale || 1
      const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, 11)
      steps[steps.length - 1] = {
        step: "4_get_last_voucher",
        status: "ok",
        data: { lastVoucher, ptoVta, cbteTipo: 11 }
      }
    } catch (lvError: any) {
      steps[steps.length - 1] = {
        step: "4_get_last_voucher",
        status: "error",
        error: lvError.message,
        data: { errorData: lvError?.data, errorStatus: lvError?.status }
      }
      return NextResponse.json({ success: false, message: lvError.message, steps })
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

    const allOk = steps.every(s => s.status === "ok")
    return NextResponse.json({
      success: allOk,
      message: allOk ? "Conexión exitosa con AFIP" : "Hay errores en la conexión",
      steps
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    steps.push({ step: "unexpected_error", status: "error", error: error.message })
    return NextResponse.json({ success: false, error: error.message, steps }, { status: 500 })
  }
}
