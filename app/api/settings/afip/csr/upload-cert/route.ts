/**
 * Carga el certificado firmado por AFIP (modo manual / sociedad) y activa la
 * integración. Valida que el cert empareje con la clave privada pendiente y que
 * el CUIT coincida, luego verifica la conexión contra AFIP.
 */
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { saveAfipConfigForAgency, getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { parseCertificate, certificateMatchesKey } from "@/lib/afip/csr"
import { testConnection, getLastVoucherNumber } from "@/lib/afip/afip-client"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const body = await request.json()
    const { agency_id, cert: certRaw } = body
    const cert = String(certRaw || "").trim()

    if (!agency_id || !cert) {
      return NextResponse.json({ error: "Faltan campos requeridos (agency_id, cert)" }, { status: 400 })
    }
    if (!cert.includes("BEGIN CERTIFICATE")) {
      return NextResponse.json(
        { error: "El certificado no parece válido (debe empezar con -----BEGIN CERTIFICATE-----)" },
        { status: 400 }
      )
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!agencyIds.includes(agency_id)) {
      return NextResponse.json({ error: "No tiene acceso a esta agencia" }, { status: 403 })
    }

    // Config pendiente (clave privada del CSR + cuit/pv/env)
    const { data: integration } = await (supabase.from("integrations") as any)
      .select("config")
      .eq("agency_id", agency_id)
      .eq("integration_type", "afip")
      .maybeSingle()
    const config = (integration as any)?.config
    const pendingKey = config?.pending_csr_key as string | undefined
    if (!config || !pendingKey) {
      return NextResponse.json(
        { error: "No hay una solicitud (CSR) pendiente para esta agencia. Generá el CSR primero." },
        { status: 400 }
      )
    }

    // Validaciones del certificado
    let certInfo
    try {
      certInfo = parseCertificate(cert)
    } catch {
      return NextResponse.json({ error: "No se pudo leer el certificado (PEM inválido)" }, { status: 400 })
    }

    const cuitConfig = String(config.cuit || "").replace(/\D/g, "")
    if (certInfo.cuit && cuitConfig && certInfo.cuit !== cuitConfig) {
      return NextResponse.json(
        { error: `El certificado es del CUIT ${certInfo.cuit}, pero la solicitud era para ${cuitConfig}.` },
        { status: 400 }
      )
    }
    if (!certificateMatchesKey(cert, pendingKey)) {
      return NextResponse.json(
        { error: "El certificado NO empareja con la clave privada generada. ¿Subiste el certificado correcto?" },
        { status: 400 }
      )
    }
    if (certInfo.notAfter.getTime() < Date.now()) {
      return NextResponse.json({ error: "El certificado está vencido." }, { status: 400 })
    }

    // Activar: cert + clave, cert_mode manual. Limpia pending_csr* y cuit_representada.
    const saveResult = await saveAfipConfigForAgency(
      supabase,
      agency_id,
      {
        api_key: config.api_key,
        cuit: config.cuit,
        point_of_sale: config.point_of_sale,
        environment: config.environment || "production",
        cert_mode: "manual",
        cert,
        key: pendingKey,
      },
      user.id
    )
    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error || "Error al guardar el certificado" },
        { status: 500 }
      )
    }

    logSecurityEvent({
      eventType: "afip_integration_setup",
      severity: "INFO",
      actorUserId: user.id,
      actorOrgId: user.org_id ?? null,
      targetEntity: "integration",
      targetEntityId: saveResult.integrationId ?? null,
      details: { agency_id, cuit: cuitConfig, cert_mode: "manual", issuer: certInfo.issuer },
    })

    // Verificación read-only contra AFIP (autenticación + PV).
    const active = await getAfipConfigForAgency(supabase, agency_id)
    let verified = false
    let verification_warning: string | null = null
    if (active) {
      const tConn = await testConnection(active)
      if (!tConn.success) {
        verification_warning = tConn.message || "No se pudo autenticar con AFIP"
      } else {
        const lastB = await getLastVoucherNumber(active, active.point_of_sale, 6)
        if (!lastB.success) {
          verification_warning = lastB.error || "El punto de venta no responde en WSFE"
        } else {
          verified = true
        }
      }
    }

    return NextResponse.json({
      success: true,
      verified,
      verification_warning,
      message: verified
        ? "Certificado cargado y verificado. Ya podés facturar como la sociedad."
        : `Certificado cargado, pero la verificación tiró: ${verification_warning}. Revisá el punto de venta o la autorización wsfe en AFIP.`,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[AFIP CSR upload-cert] Error:", error)
    return NextResponse.json({ error: error.message || "Error al cargar el certificado" }, { status: 500 })
  }
}
