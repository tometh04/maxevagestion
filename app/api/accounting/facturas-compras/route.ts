import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { createServerClient } from "@/lib/supabase/server"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"

/**
 * GET /api/accounting/facturas-compras
 * Fetches received invoices (comprobantes recibidos) from AFIP via AfipSDK automation
 */
export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  const userRole = user.role as any

  if (!hasPermission(userRole, "accounting", "read")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const agencyId = searchParams.get("agencyId")
  const dateFrom = searchParams.get("dateFrom") || "01/01/2026"
  const dateTo = searchParams.get("dateTo") || "31/12/2026"

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

  const afipPassword = searchParams.get("afipPassword")
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
    const afip = new Afip({
      CUIT: Number(afipConfig.cuit),
      production: afipConfig.environment === "production",
      access_token: afipConfig.api_key,
      ...(afipConfig.cert && { cert: afipConfig.cert }),
      ...(afipConfig.key && { key: afipConfig.key }),
    })

    console.log("[Facturas Compras] Calling mis-comprobantes automation for CUIT:", afipConfig.cuit, "range:", dateFrom, "-", dateTo)

    // Call "mis-comprobantes" automation with filter t=R (Recibidos)
    const result = await afip.CreateAutomation("mis-comprobantes", {
      cuit: afipConfig.cuit,
      username: afipConfig.cuit, // AFIP portal username is usually the CUIT
      password: afipPassword,
      filters: {
        t: "R", // R = Recibidos (received), E = Emitidos (issued)
        fechaEmision: `${dateFrom} - ${dateTo}`,
      },
    }, true) // true = wait for completion

    console.log("[Facturas Compras] Automation result:", JSON.stringify(result).substring(0, 500))

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
      cuit: afipConfig.cuit,
      dateRange: { from: dateFrom, to: dateTo },
    })
  } catch (error: any) {
    console.error("[Facturas Compras] Error:", error.message)

    // Check if it's a credentials error
    if (error.message?.includes("password") || error.message?.includes("credential") || error.message?.includes("auth")) {
      return NextResponse.json({
        error: "Se requiere la clave fiscal de AFIP para consultar comprobantes recibidos",
        needsPassword: true,
        vouchers: [],
      }, { status: 200 })
    }

    return NextResponse.json({
      error: error.message || "Error al consultar AFIP",
      vouchers: [],
    }, { status: 200 })
  }
}
