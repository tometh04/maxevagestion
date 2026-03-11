/**
 * Proxy rápido al AFIP SDK para automatizaciones.
 * POST: inicia una automatización y devuelve el automation_id inmediatamente.
 * GET:  consulta el estado de una automatización (para polling desde el cliente).
 *
 * Sin polling server-side → nunca hace timeout en Vercel.
 * Usa AFIP_CUIT y AFIP_PASSWORD de env vars si están disponibles.
 */
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

const AFIP_SDK_BASE_URL = "https://app.afipsdk.com/api/v1"

export const dynamic = "force-dynamic"

/** POST /api/settings/afip/automation — Inicia una automatización */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const api_key = process.env.AFIP_SDK_API_KEY
    if (!api_key) {
      return NextResponse.json({ error: "AFIP SDK no configurado en el servidor" }, { status: 500 })
    }

    const body = await request.json()
    const { automation, params: bodyParams } = body

    if (!automation) {
      return NextResponse.json({ error: "Falta el campo 'automation'" }, { status: 400 })
    }

    // Usar env vars como fuente de verdad; el frontend puede enviar vacíos si están configurados
    const systemCuit = process.env.AFIP_CUIT?.replace(/\D/g, "")
    const systemPassword = process.env.AFIP_PASSWORD

    const params = {
      ...bodyParams,
      // Sobrescribir con env vars si están disponibles
      ...(systemCuit && { cuit: systemCuit, username: systemCuit }),
      ...(systemPassword && { password: systemPassword }),
    }

    if (!params.cuit) {
      return NextResponse.json({ error: "CUIT no configurado. Agregá AFIP_CUIT a las variables de entorno o ingresalo en el formulario." }, { status: 400 })
    }
    if (!params.password) {
      return NextResponse.json({ error: "Clave Fiscal no configurada. Agregá AFIP_PASSWORD a las variables de entorno o ingresala en el formulario." }, { status: 400 })
    }

    console.log(`[AFIP Automation] Iniciando '${automation}' para CUIT ${params.cuit}`)

    const response = await fetch(`${AFIP_SDK_BASE_URL}/automations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      body: JSON.stringify({ automation, params }),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMsg =
        (data.data_errors ? JSON.stringify(data.data_errors) : null) ||
        data.message ||
        data.error ||
        data.detail ||
        JSON.stringify(data) ||
        `Error ${response.status}`
      console.error("[AFIP Automation] Error al iniciar:", response.status, JSON.stringify(data))
      return NextResponse.json({ error: errorMsg }, { status: response.status })
    }

    console.log(`[AFIP Automation] Iniciada OK. ID: ${data.id || data.automation_id}, Status: ${data.status}`)

    return NextResponse.json({
      automation_id: data.id || data.automation_id,
      status: data.status || "pending",
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[AFIP Automation] Error:", error)
    return NextResponse.json({ error: error.message || "Error al iniciar automatización" }, { status: 500 })
  }
}

/** GET /api/settings/afip/automation?automation_id=xxx — Consulta estado */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const api_key = process.env.AFIP_SDK_API_KEY
    if (!api_key) {
      return NextResponse.json({ error: "AFIP SDK no configurado en el servidor" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const automationId = searchParams.get("automation_id")

    if (!automationId) {
      return NextResponse.json({ error: "automation_id es requerido" }, { status: 400 })
    }

    const response = await fetch(`${AFIP_SDK_BASE_URL}/automations/${automationId}`, {
      headers: { Authorization: `Bearer ${api_key}` },
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMsg = data.message || data.error || JSON.stringify(data) || `Error ${response.status}`
      return NextResponse.json({ error: errorMsg }, { status: response.status })
    }

    return NextResponse.json({
      status: data.status,
      result: data.result,
      error: data.error || null,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[AFIP Automation Status] Error:", error)
    return NextResponse.json({ error: error.message || "Error al consultar automatización" }, { status: 500 })
  }
}
