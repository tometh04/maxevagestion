/**
 * Envío de mensajes salientes por WHA Control (connector Baileys).
 *
 * Capa fina de transporte reutilizable por las rutas con sesión de usuario
 * (app/api/wha-control/chats/[chatId]/send) y por crons (seguimientos
 * automáticos). No valida tenancy ni permisos: eso es responsabilidad del
 * caller, que debe resolver deviceId/remoteJid desde filas ya scopeadas.
 */

import { callConnector } from "@/lib/wha-control/connector-client"

export interface SendWhaMessageParams {
  deviceId: string
  remoteJid: string
  text?: string
  imageBase64?: string
  documentBase64?: string
  fileName?: string
  mimeType?: string
  caption?: string
  timeoutMs?: number
}

export interface SendWhaMessageResult {
  ok: boolean
  waMessageId: string | null
  error?: string
}

export async function sendWhaMessage(
  params: SendWhaMessageParams
): Promise<SendWhaMessageResult> {
  const timeoutMs =
    params.timeoutMs ??
    (params.imageBase64 || params.documentBase64 ? 30000 : 15000)

  const result = await callConnector(
    `/devices/${params.deviceId}/send`,
    "POST",
    {
      to: params.remoteJid,
      text: params.text,
      imageBase64: params.imageBase64,
      documentBase64: params.documentBase64,
      fileName: params.fileName,
      mimeType: params.mimeType,
      caption: params.caption,
    },
    timeoutMs
  )

  if (!result.ok) {
    return { ok: false, waMessageId: null, error: result.error }
  }

  return { ok: true, waMessageId: result.data?.wa_message_id ?? null }
}
