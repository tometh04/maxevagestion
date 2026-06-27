import crypto from "crypto"
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { getOrgAgencyIds } from "@/lib/organizations"
import { encryptSecret, decryptSecret } from "@/lib/integrations/secrets"
import {
  eveUpsertAgencia,
  eveGetAgencia,
} from "@/lib/integrations/eve/client"
import type { EveIntegrationConfig } from "@/lib/integrations/eve/types"

export const dynamic = "force-dynamic"

/**
 * GET /api/eve/connection
 * Devuelve el estado de la integración Eve para esta org.
 * Si no está conectada → { connected: false }.
 * Si está conectada, intenta obtener el estado de Eve (tolera caídas).
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    // Guard canónico multi-tenant (ver CLAUDE.md)
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "eve", "read")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Cross-tenant fix: filtro explícito por org_id, no confiar en RLS
    // webhook_token se lee server-side para calcular webhook_configured; NO se devuelve al cliente
    const { data: integ } = await (supabase
      .from("org_integrations") as any)
      .select("org_id, is_active, config, webhook_token")
      .eq("org_id", user.org_id)
      .eq("integration", "eve")
      .maybeSingle()

    if (!integ) {
      return NextResponse.json({ connected: false })
    }

    const webhookConfigured = !!integ.webhook_token && integ.is_active === true

    // Intentar obtener estado de Eve (toleramos que esté caído)
    try {
      const { agencia, canales } = await eveGetAgencia(user.org_id)
      return NextResponse.json({
        connected: true,
        webhook_configured: webhookConfigured,
        agencia,
        canales,
      })
    } catch {
      return NextResponse.json({
        connected: true,
        webhook_configured: webhookConfigured,
        agencia: null,
        canales: [],
        error: "eve_unreachable",
      })
    }
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
    console.error("[eve/connection GET]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * POST /api/eve/connection
 * Conecta (o reconecta) la org con Eve.
 * Genera webhook_token + secret, registra la agencia en Eve,
 * y guarda el secret CIFRADO en org_integrations.
 *
 * Si la integración ya existe: preserva el webhook_token/secret para
 * no invalidar la URL ya configurada en Eve.
 *
 * Nunca devuelve el webhook_token ni el secret al cliente.
 */
export async function POST() {
  try {
    const { user } = await getCurrentUser()
    // Guard canónico multi-tenant
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "eve", "write")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // 1. Nombre de la org (Cross-tenant fix: filtro explícito por id)
    const { data: org } = await (supabase
      .from("organizations") as any)
      .select("name")
      .eq("id", user.org_id)
      .maybeSingle()
    const orgName: string = (org as any)?.name || "Sin nombre"

    // 2. Default agency_id (primera agencia de la org)
    const agencyIds = await getOrgAgencyIds(user.org_id)
    const defaultAgencyId = agencyIds?.[0] ?? null

    // 3. Verificar si ya existe la integración (para preservar token/secret)
    const { data: existing } = await (supabase
      .from("org_integrations") as any)
      .select("webhook_token, webhook_secret, config")
      .eq("org_id", user.org_id)        // Cross-tenant fix
      .eq("integration", "eve")
      .maybeSingle()

    let webhookToken: string
    let plainSecret: string
    let encryptedSecret: string

    if (existing?.webhook_token && existing?.webhook_secret) {
      // Preservar token y secret para no invalidar la URL configurada en Eve
      webhookToken = existing.webhook_token
      try {
        plainSecret = decryptSecret(existing.webhook_secret)
        encryptedSecret = existing.webhook_secret
      } catch {
        // Si el decrypt falla (p.ej. clave rotada), regenerar
        webhookToken = crypto.randomBytes(32).toString("hex")
        plainSecret = crypto.randomBytes(32).toString("hex")
        encryptedSecret = encryptSecret(plainSecret)
      }
    } else {
      // Primera conexión: generar token y secret frescos
      webhookToken = crypto.randomBytes(32).toString("hex")
      plainSecret = crypto.randomBytes(32).toString("hex")
      encryptedSecret = encryptSecret(plainSecret)
    }

    // 4. URL del webhook (usa el token — Eve llamará a esta URL para enviar leads)
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/eve-in/${webhookToken}/webhook`

    // 5. Registrar/actualizar agencia en Eve.
    //    El secret va EN CLARO a Eve; Eve lo usará para firmar sus requests.
    //    maxeva lo verifica en M2 (decryptSecret → verifyHmac).
    const { agencia_id, created } = await eveUpsertAgencia({
      vibook_org_id: user.org_id,
      nombre: orgName,
      lead_webhook_url: webhookUrl,
      lead_webhook_secret: plainSecret,
    })

    // 6. Upsert en org_integrations.
    //    config: preservar campos previos + actualizar eve_agencia_id/default_agency_id.
    const prevConfig = (existing?.config as EveIntegrationConfig | null) ?? {}
    const newConfig: EveIntegrationConfig = {
      ...prevConfig,
      eve_agencia_id: agencia_id,
      ...(defaultAgencyId ? { default_agency_id: defaultAgencyId } : {}),
    }

    const { error: upsertErr } = await (supabase
      .from("org_integrations") as any)
      .upsert(
        {
          org_id: user.org_id,
          integration: "eve",
          webhook_token: webhookToken,
          webhook_secret: encryptedSecret,
          is_active: true,
          config: newConfig,
        },
        { onConflict: "org_id,integration" }
      )

    if (upsertErr) {
      console.error("[eve/connection POST] upsert org_integrations error:", upsertErr)
      return NextResponse.json({ error: "Error al guardar integración" }, { status: 500 })
    }

    // 7. Devolver resultado (NUNCA devolver tokens ni secrets al cliente)
    return NextResponse.json({
      ok: true,
      agencia_id,
      reconnected: !created,
    })
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
    console.error("[eve/connection POST]", err)
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    )
  }
}
