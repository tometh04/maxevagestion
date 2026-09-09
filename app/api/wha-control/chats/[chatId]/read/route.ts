import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { filterAccessibleChatIds, scopeFromAuth } from "@/lib/wha-control/access"

const schema = z.object({
  // Las dos mitades de una conversación partida por LID se marcan juntas.
  chatIds: z.array(z.string().uuid()).max(4).optional(),
})

/**
 * Marca la conversación como leída hasta ahora. Los no leídos del inbox se
 * cuentan contra este timestamp, no contra el contador de WhatsApp (que refleja
 * lo que se leyó en el celular del vendedor).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { chatId } = await params

  let parsed: z.infer<typeof schema>
  try {
    const body = await request.json().catch(() => ({}))
    const result = schema.safeParse(body ?? {})
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

  // adminDb justificado: wa_chats tiene org_id y el update va filtrado por el
  // orgId del caller, así que no se puede marcar el chat de otro tenant.
  const supabase = createAdminClient() as any

  const ids = await filterAccessibleChatIds(
    supabase,
    scopeFromAuth(auth),
    Array.from(new Set([...(parsed.chatIds ?? []), chatId]))
  )
  if (ids.length === 0) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 })
  }

  const { error } = await supabase
    .from("wa_chats")
    .update({ last_read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("org_id", auth.orgId)

  if (error) {
    console.error("[wha-control/read] error marcando leído:", error.message)
    return NextResponse.json(
      { error: "No se pudo marcar como leída" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
