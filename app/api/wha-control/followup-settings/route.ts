import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

const DEFAULTS = {
  wait_hours: 24,
  message_text: "",
  send_window_from: 9,
  send_window_to: 21,
}

const putSchema = z
  .object({
    wait_hours: z.number().int().min(1).max(168),
    message_text: z.string().trim().min(1).max(2000),
    send_window_from: z.number().int().min(0).max(23),
    send_window_to: z.number().int().min(1).max(24),
  })
  .refine((d) => d.send_window_from < d.send_window_to, {
    message: "La ventana horaria es inválida (desde debe ser menor que hasta)",
  })

export async function GET() {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  // adminDb justificado: wa_followup_settings tiene org_id; query filtrada
  // por el orgId del caller.
  const supabase = createAdminClient() as any

  const { data } = await supabase
    .from("wa_followup_settings")
    .select("wait_hours, message_text, send_window_from, send_window_to")
    .eq("org_id", auth.orgId)
    .maybeSingle()

  return NextResponse.json({ settings: data ?? DEFAULTS, configured: !!data })
}

export async function PUT(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  // La espera, el texto y la ventana horaria son de la organización: las define
  // quien administra, no cada vendedor.
  if (!auth.isWhaAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  let parsed: z.infer<typeof putSchema>
  try {
    const body = await request.json()
    const result = putSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || "Payload inválido" },
        { status: 400 }
      )
    }
    parsed = result.data
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  // adminDb justificado: upsert con org_id inyectado del caller.
  const supabase = createAdminClient() as any

  const { error } = await supabase.from("wa_followup_settings").upsert(
    {
      org_id: auth.orgId,
      ...parsed,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  )

  if (error) {
    console.error("[followup-settings] upsert error:", error)
    return NextResponse.json(
      { error: "No se pudo guardar la configuración" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
