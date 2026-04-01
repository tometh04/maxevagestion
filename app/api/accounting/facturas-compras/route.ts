import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { createServerClient } from "@/lib/supabase/server"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"

/**
 * POST /api/accounting/facturas-compras
 * Fetches received invoices (comprobantes recibidos) from AFIP via AfipSDK automation
 * Uses POST to safely send AFIP password in request body (not URL params)
 */
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const userRole = user.role as any

  if (!hasPermission(userRole, "accounting", "read")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { agencyId, dateFrom = "01/01/2026", dateTo = "31/12/2026", afipPassword } = body

  if (!agencyId) {
    return NextResponse.json({ error: "agencyId es requerido" }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Get AFIP config for this agency
  const afipConfig = await getAfipConfigForAgency(supabase as any, agencyId)
  if (!afipConfig) {
    return NextResponse.json({
      error: "Esta agencia no tiene AFIP configurado",
      vouchers: [],
    }, { status: 200 })
  }

  if (!afipPassword) {
    return NextResponse.json({
      error: "Se requiere la clave fiscal de AFIP",
      needsPassword: true,
      vouchers: [],
    })
  }

  try {
    // Use AfipSDK automation to fetch received invoices
    /* eslint-disable-next-line */
    const Afip = require("@afipsdk/afip.js")

    // For automations, we mainly need the access_token (API key)
    // CUIT and production flag also set the sdk-environment header
    const afip = new Afip({
      CUIT: afipConfig.cuit,
      production: true, // Always use production for portal automations
      access_token: afipConfig.api_key,
    })

    const cuitStr = String(afipConfig.cuit).replace(/[-\s]/g, "")

    console.log("[Facturas Compras] Calling mis-comprobantes automation for CUIT:", cuitStr, "range:", dateFrom, "-", dateTo)

    // Call "mis-comprobantes" automation with filter t=R (Recibidos)
    // Params follow AfipSDK docs: https://afipsdk.com/docs/automations/mis-comprobantes/api/
    const result = await afip.CreateAutomation("mis-comprobantes", {
      cuit: cuitStr,
      username: cuitStr,
      password: afipPassword,
      filters: {
        t: "R", // R = Recibidos (received), E = Emitidos (issued)
        fechaEmision: `${dateFrom} - ${dateTo}`,
      },
    }, true) // true = wait for completion

    console.log("[Facturas Compras] Automation result status:", result?.status, "data length:", Array.isArray(result?.data) ? result.data.length : "not array")

    if (!result || !result.data) {
      return NextResponse.json({
        vouchers: [],
        message: "No se encontraron comprobantes recibidos",
      })
    }

    // Normalize the response
    const vouchers = Array.isArray(result.data) ? result.data : [result.data]

    return NextResponse.json({
      vouchers,
      total: vouchers.length,
      cuit: cuitStr,
      dateRange: { from: dateFrom, to: dateTo },
    })
  } catch (error: any) {
    // Log full error details from AfipSDK (error.data contains API response)
    console.error("[Facturas Compras] Error:", error.message)
    if (error.data) {
      console.error("[Facturas Compras] Error data:", JSON.stringify(error.data))
    }
    if (error.status) {
      console.error("[Facturas Compras] Error status:", error.status)
    }

    // Check if it's a credentials error
    const errorMsg = error.message || ""
    const errorData = error.data ? JSON.stringify(error.data) : ""
    const combinedError = `${errorMsg} ${errorData}`.toLowerCase()

    if (combinedError.includes("password") || combinedError.includes("credential") || combinedError.includes("auth") || combinedError.includes("login")) {
      return NextResponse.json({
        error: "Credenciales de AFIP inválidas. Verificá tu clave fiscal.",
        needsPassword: true,
        vouchers: [],
      }, { status: 200 })
    }

    // Return the full error details so we can debug
    return NextResponse.json({
      error: error.message || "Error al consultar AFIP",
      errorDetails: error.data || null,
      errorStatus: error.status || null,
      vouchers: [],
    }, { status: 200 })
  }
}
