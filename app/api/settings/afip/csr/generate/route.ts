/**
 * Genera un par de claves + CSR para el modo "manual / sociedad".
 * La sociedad sube el CSR a AFIP y descarga el certificado firmado, que después
 * se carga en /api/settings/afip/csr/upload-cert. La clave privada queda del
 * lado del server (en la config, estado 'pending') hasta que suben el cert.
 */
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { saveAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { isValidCuit, formatCuit } from "@/lib/afip/afip-config"
import { generateKeyAndCsr } from "@/lib/afip/csr"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const body = await request.json()
    const { agency_id, cuit: bodyCuit, razon_social, punto_venta, environment = "production" } = body

    if (!agency_id || !bodyCuit || !punto_venta) {
      return NextResponse.json(
        { error: "Faltan campos requeridos (agency_id, cuit, punto_venta)" },
        { status: 400 }
      )
    }

    const cuit = formatCuit(bodyCuit)
    if (!isValidCuit(cuit)) {
      return NextResponse.json({ error: "El CUIT debe tener 11 dígitos" }, { status: 400 })
    }

    const ptoVta = Number(punto_venta)
    if (!ptoVta || ptoVta < 1 || ptoVta > 9999) {
      return NextResponse.json({ error: "Número de punto de venta inválido (1-9999)" }, { status: 400 })
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!agencyIds.includes(agency_id)) {
      return NextResponse.json({ error: "No tiene acceso a esta agencia" }, { status: 403 })
    }

    const apiKey = process.env.AFIP_SDK_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "El sistema AFIP no está configurado. Contacte al administrador." },
        { status: 500 }
      )
    }

    // Generar keypair + CSR con el subject que exige AFIP.
    const { privateKeyPem, csrPem } = generateKeyAndCsr({
      cuit,
      razonSocial: String(razon_social || "").trim(),
    })

    // Persistir en estado 'pending': guarda la clave privada y el CSR; NO hay
    // cert todavía, así que la integración no se usa para facturar.
    const saveResult = await saveAfipConfigForAgency(
      supabase,
      agency_id,
      {
        api_key: apiKey,
        cuit,
        point_of_sale: ptoVta,
        environment: environment as "sandbox" | "production",
        cert_mode: "manual",
        pending_csr: csrPem,
        pending_csr_key: privateKeyPem,
      },
      user.id
    )

    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error || "Error al guardar la solicitud" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      csr: csrPem,
      cuit,
      message: "CSR generado. Descargalo, tramitalo en AFIP y volvé a subir el certificado firmado.",
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[AFIP CSR generate] Error:", error)
    return NextResponse.json({ error: error.message || "Error al generar el CSR" }, { status: 500 })
  }
}
