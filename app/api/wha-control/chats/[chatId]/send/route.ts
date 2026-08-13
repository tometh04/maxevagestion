import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

const sendSchema = z
  .object({
    text: z.string().trim().max(4096).optional(),
    imageBase64: z.string().min(1).optional(),
    mimeType: z.string().max(100).optional(),
    caption: z.string().max(4096).optional(),
  })
  .refine((d) => (d.text && d.text.trim()) || d.imageBase64, {
    message: "Falta texto o imagen",
  })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { chatId } = await params

  let parsed: z.infer<typeof sendSchema>
  try {
    const body = await request.json()
    const result = sendSchema.safeParse(body)
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

  // adminDb justificado: wa_chats tiene org_id; pre-validamos el chat contra el
  // orgId del caller antes de resolver device/remote_jid para evitar forge de URL.
  const supabase = createAdminClient() as any

  const { data: chat } = await supabase
    .from("wa_chats")
    .select("id, device_id, remote_jid")
    .eq("id", chatId)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!chat) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 })
  }

  const result = await callConnector(
    `/devices/${chat.device_id}/send`,
    "POST",
    {
      to: chat.remote_jid,
      text: parsed.text,
      imageBase64: parsed.imageBase64,
      mimeType: parsed.mimeType,
      caption: parsed.caption,
    },
    parsed.imageBase64 ? 30000 : 15000
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "No se pudo enviar el mensaje" },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    wa_message_id: result.data?.wa_message_id ?? null,
  })
}
