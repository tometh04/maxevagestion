import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { getAccessibleChat, scopeFromAuth } from "@/lib/wha-control/access"
import { sendWhaMessage } from "@/lib/wha-control/send-message"

const sendSchema = z
  .object({
    text: z.string().trim().max(4096).optional(),
    imageBase64: z.string().min(1).optional(),
    documentBase64: z.string().min(1).optional(),
    fileName: z.string().max(255).optional(),
    mimeType: z.string().max(100).optional(),
    caption: z.string().max(4096).optional(),
  })
  .refine((d) => (d.text && d.text.trim()) || d.imageBase64 || d.documentBase64, {
    message: "Falta texto, imagen o documento",
  })
  .refine((d) => !(d.imageBase64 && d.documentBase64), {
    message: "Adjuntá imagen o documento, no ambos",
  })
  .refine((d) => !d.documentBase64 || (d.fileName && d.fileName.trim()), {
    message: "El documento necesita un nombre de archivo",
  })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { chatId } = await params

  // El parseo del body y la validación se manejan por separado: los adjuntos
  // viajan en base64 dentro del JSON, así que un archivo grande puede cortar el
  // body y hacer fallar request.json(). Mezclar ambos casos en un solo catch
  // devolvía "Body inválido" para cualquier error, sin rastro del motivo.
  let body: unknown
  try {
    body = await request.json()
  } catch (err) {
    console.error(
      `[wha-control/send] body ilegible en chat ${chatId}:`,
      (err as Error)?.message
    )
    return NextResponse.json(
      {
        error:
          "No se pudo leer el envío. Si adjuntaste un archivo, probá con uno más liviano.",
      },
      { status: 400 }
    )
  }

  const validation = sendSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors[0]?.message || "Payload inválido" },
      { status: 400 }
    )
  }
  const parsed = validation.data

  // adminDb justificado: wa_chats tiene org_id; pre-validamos el chat contra el
  // orgId del caller antes de resolver device/remote_jid para evitar forge de URL.
  const supabase = createAdminClient() as any

  const chat = await getAccessibleChat(supabase, scopeFromAuth(auth), chatId, "id, device_id, remote_jid")

  if (!chat) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 })
  }

  const result = await sendWhaMessage({
    deviceId: chat.device_id,
    remoteJid: chat.remote_jid,
    text: parsed.text,
    imageBase64: parsed.imageBase64,
    documentBase64: parsed.documentBase64,
    fileName: parsed.fileName,
    mimeType: parsed.mimeType,
    caption: parsed.caption,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "No se pudo enviar el mensaje" },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    wa_message_id: result.waMessageId,
  })
}
