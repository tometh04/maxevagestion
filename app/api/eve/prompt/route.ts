import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { eveSetPrompt } from "@/lib/integrations/eve/client"
import type { EveIntegrationConfig } from "@/lib/integrations/eve/types"

export const dynamic = "force-dynamic"

const MAX_PROMPT_LENGTH = 20_000

/**
 * GET /api/eve/prompt
 * Devuelve el espejo local del prompt_custom guardado en org_integrations.config.
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

    const config = (integ?.config as EveIntegrationConfig | null) ?? {}
    return NextResponse.json({ prompt_custom: config.prompt_custom ?? null })
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
    console.error("[eve/prompt GET]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * PUT /api/eve/prompt
 * Guarda el prompt_custom en el espejo local (org_integrations.config) y
 * lo sincroniza a Eve vía eveSetPrompt.
 *
 * Body: { prompt_custom: string }
 * 409 si la integración no está conectada.
 * 400 si el prompt excede MAX_PROMPT_LENGTH.
 */
export async function PUT(req: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "eve", "write")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const body = await req.json()
    const { prompt_custom } = body

    if (typeof prompt_custom !== "string") {
      return NextResponse.json({ error: "prompt_custom debe ser string" }, { status: 400 })
    }
    if (prompt_custom.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `prompt_custom supera el límite de ${MAX_PROMPT_LENGTH} caracteres` },
        { status: 400 }
      )
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
      return NextResponse.json({ error: "no conectado" }, { status: 409 })
    }

    const config = (integ.config as EveIntegrationConfig) ?? {}
    if (!config.eve_agencia_id) {
      return NextResponse.json({ error: "no conectado" }, { status: 409 })
    }

    // Merge: actualizar solo prompt_custom, preservar eve_agencia_id y default_agency_id
    const updatedConfig: EveIntegrationConfig = { ...config, prompt_custom }

    const { error: updateErr } = await (supabase
      .from("org_integrations") as any)
      .update({ config: updatedConfig })
      .eq("org_id", user.org_id)           // Cross-tenant fix
      .eq("integration", "eve")

    if (updateErr) {
      console.error("[eve/prompt PUT] update config error:", updateErr)
      return NextResponse.json({ error: "Error al guardar prompt" }, { status: 500 })
    }

    // Sincronizar con Eve (fire-and-forget con error handling)
    try {
      await eveSetPrompt(config.eve_agencia_id, prompt_custom)
    } catch (eveErr) {
      // No rollbackeamos la actualización local — Eve puede reintentarse luego
      console.error("[eve/prompt PUT] eveSetPrompt error (ignorado):", eveErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
    console.error("[eve/prompt PUT]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
