import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"

export const dynamic = 'force-dynamic'

// DEBUG: ver respuesta cruda del SDK para puntos de venta
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    const results: any[] = []

    for (const agencyId of agencyIds) {
      const afipConfig = await getAfipConfigForAgency(supabase, agencyId)
      if (!afipConfig) {
        results.push({ agencyId, error: 'Sin config AFIP' })
        continue
      }

      // Paso 1: auth
      // afipsdk.com usa "prod"/"dev", no "production"/"sandbox"
      const sdkEnv = afipConfig.environment === 'production' ? 'prod' : 'dev'
      const authRes = await fetch(`https://app.afipsdk.com/api/v1/afip/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${afipConfig.api_key}`,
        },
        body: JSON.stringify({
          environment: sdkEnv,
          tax_id: afipConfig.cuit,
          wsid: 'wsfe',
          force_create: false,
        }),
      })
      const authData = await authRes.json()

      if (!authRes.ok) {
        results.push({ agencyId, cuit: afipConfig.cuit, step: 'auth', error: authData })
        continue
      }

      // Paso 2: FEParamGetPtosVenta
      const pvsRes = await fetch(`https://app.afipsdk.com/api/v1/afip/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${afipConfig.api_key}`,
        },
        body: JSON.stringify({
          environment: sdkEnv,
          method: 'FEParamGetPtosVenta',
          wsid: 'wsfe',
          params: {
            Auth: {
              Token: authData.token || authData.Token,
              Sign: authData.sign || authData.Sign,
              Cuit: afipConfig.cuit,
            },
          },
        }),
      })
      const pvsData = await pvsRes.json()

      results.push({
        agencyId,
        cuit: afipConfig.cuit,
        environment: afipConfig.environment,
        authOk: authRes.ok,
        authData: { token: authData.token ? '✓' : '✗', sign: authData.sign ? '✓' : '✗' },
        pvsStatus: pvsRes.status,
        pvsRaw: pvsData,
      })
    }

    return NextResponse.json({ results })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
