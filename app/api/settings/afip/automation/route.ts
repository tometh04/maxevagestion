/**
 * Proxy al AFIP SDK para automatizaciones (create-cert, auth-web-service,
 * detección de puntos de venta, etc).
 * POST: inicia una automatización y devuelve el automation_id inmediatamente.
 * GET:  consulta el estado de una automatización (para polling desde el cliente).
 *
 * Sin polling server-side → nunca hace timeout en Vercel.
 * Credenciales CUIT/clave fiscal vienen SIEMPRE del body (por tenant).
 * Solo AFIP_SDK_API_KEY se toma de env — es la licencia global del SDK.
 */
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

const AFIP_SDK_BASE_URL = "https://app.afipsdk.com/api/v1"

export const dynamic = "force-dynamic"

/** POST /api/settings/afip/automation — Inicia una automatización */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const role = user.role as string
    if (role !== "SUPER_ADMIN" && role !== "ORG_OWNER" && role !== "ADMIN") {
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

    // SaaS multi-tenant: CUIT y clave fiscal vienen EXCLUSIVAMENTE del body.
    // Antes se sobrescribían con process.env.AFIP_CUIT / AFIP_PASSWORD, lo que
    // hacía que cualquier tenant terminara corriendo la automation con las
    // credenciales de Lozada. Cada agencia usa las suyas.
    const params = {
      ...bodyParams,
    }

    if (params.cuit) {
      params.cuit = String(params.cuit).replace(/\D/g, "")
      if (!params.username) params.username = params.cuit
    }

    if (!params.cuit) {
      return NextResponse.json(
        { error: "CUIT requerido. Ingresá el CUIT de tu agencia en el formulario." },
        { status: 400 }
      )
    }
    if (!params.password) {
      return NextResponse.json(
        { error: "Clave Fiscal requerida. Ingresá la clave fiscal de la agencia en el formulario." },
        { status: 400 }
      )
    }

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
    const role = user.role as string
    if (role !== "SUPER_ADMIN" && role !== "ORG_OWNER" && role !== "ADMIN") {
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

    // afipsdk.com stores cert data in `data` field (not `result`)
    // Normalize both fields so the client gets the cert no matter what
    const resultData = data.data || data.result || null
    const normalizedStatus = data.status === 'complete' ? 'completed' : data.status

    return NextResponse.json({
      status: normalizedStatus,
      result: resultData,
      error: data.error || null,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[AFIP Automation Status] Error:", error)
    return NextResponse.json({ error: error.message || "Error al consultar automatización" }, { status: 500 })
  }
}
