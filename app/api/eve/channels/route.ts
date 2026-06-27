import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import {
  eveGetAgencia,
  eveUpsertCanal,
  type EveUpsertCanalInput,
} from "@/lib/integrations/eve/client"
import type { EveIntegrationConfig } from "@/lib/integrations/eve/types"

export const dynamic = "force-dynamic"

const VALID_TIPOS = ["whatsapp", "instagram", "messenger"] as const
type CanalTipo = (typeof VALID_TIPOS)[number]

/**
 * GET /api/eve/channels
 * Lista los canales de mensajería de la agencia Eve.
 * Proyecta los datos sin exponer tokens Meta ni secrets.
 * Devuelve [] si no hay integración conectada o Eve está caído.
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "eve", "read")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Cross-tenant fix: filtro explícito por org_id
    const { data: integ } = await (supabase
      .from("org_integrations") as any)
      .select("config")
      .eq("org_id", user.org_id)
      .eq("integration", "eve")
      .maybeSingle()

    if (!integ) {
      return NextResponse.json({ channels: [] })
    }

    try {
      const { canales } = await eveGetAgencia(user.org_id)
      // Proyectar solo campos seguros — los tokens Meta NO viajan a maxeva
      const channels = canales.map(({ id, tipo, external_id, activa, config: cfg }) => ({
        id,
        tipo,
        external_id,
        activa,
        config: cfg,
      }))
      return NextResponse.json({ channels })
    } catch {
      return NextResponse.json({ channels: [], error: "eve_unreachable" })
    }
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
    console.error("[eve/channels GET]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * POST /api/eve/channels
 * Registra o actualiza un canal de mensajería en Eve vía eveUpsertCanal.
 *
 * Body: { tipo: "whatsapp"|"instagram"|"messenger", external_id, token?, waba_id?, config? }
 *
 * Los tokens Meta (WhatsApp Business API, etc.) se reenvían directamente a Eve
 * y NO se persisten en maxeva (privacy + seguridad).
 *
 * 409 si la integración no está conectada.
 */
export async function POST(req: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "eve", "write")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const body = await req.json()
    const { tipo, external_id, token, waba_id, config } = body

    // Validar tipo
    if (!VALID_TIPOS.includes(tipo as CanalTipo)) {
      return NextResponse.json(
        { error: `tipo inválido: ${tipo}. Valores aceptados: ${VALID_TIPOS.join(", ")}` },
        { status: 400 }
      )
    }
    // Validar external_id
    if (!external_id || typeof external_id !== "string") {
      return NextResponse.json({ error: "external_id es requerido" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Cross-tenant fix: filtro explícito por org_id
    const { data: integ } = await (supabase
      .from("org_integrations") as any)
      .select("config")
      .eq("org_id", user.org_id)
      .eq("integration", "eve")
      .maybeSingle()

    const integConfig = (integ?.config as EveIntegrationConfig | null) ?? {}
    if (!integConfig.eve_agencia_id) {
      return NextResponse.json({ error: "no conectado" }, { status: 409 })
    }

    // Construir payload para eveUpsertCanal.
    // Los tokens Meta viajan directamente a Eve — NO se guardan en maxeva.
    const canalInput: EveUpsertCanalInput = {
      agencia_id: integConfig.eve_agencia_id,
      tipo: tipo as CanalTipo,
      external_id,
      ...(token ? { token } : {}),
      ...(waba_id ? { waba_id } : {}),
      ...(config ? { config } : {}),
    }

    const { canal_id, waba_subscribed } = await eveUpsertCanal(canalInput)

    return NextResponse.json({ ok: true, canal_id, waba_subscribed })
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
    console.error("[eve/channels POST]", err)
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    )
  }
}
