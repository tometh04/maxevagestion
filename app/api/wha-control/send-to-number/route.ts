import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { sendWhaMessage } from "@/lib/wha-control/send-message"
import { phoneToWaJid } from "@/lib/wha-control/phone"

const schema = z.object({
  deviceId: z.string().uuid(),
  phone: z.string().trim().min(6).max(30),
  text: z.string().trim().min(1).max(4096),
})

/**
 * Envía un mensaje a un número arbitrario (aunque no exista un wa_chats
 * todavía). El connector persiste el chat y el mensaje con el echo de Baileys,
 * así que después del envío el chat aparece en el listado.
 */
export async function POST(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  let parsed: z.infer<typeof schema>
  try {
    const body = await request.json()
    const result = schema.safeParse(body)
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

  const remoteJid = phoneToWaJid(parsed.phone)
  if (!remoteJid) {
    return NextResponse.json(
      { error: "Número de teléfono inválido" },
      { status: 400 }
    )
  }

  // adminDb justificado: wa_devices tiene org_id; se pre-valida el device
  // contra el orgId del caller antes de llamar al connector.
  const supabase = createAdminClient() as any

  const { data: device } = await supabase
    .from("wa_devices")
    .select("id, status")
    .eq("id", parsed.deviceId)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!device) {
    return NextResponse.json({ error: "Device no encontrado" }, { status: 404 })
  }
  if (device.status !== "CONNECTED") {
    return NextResponse.json(
      { error: "El dispositivo no está conectado" },
      { status: 409 }
    )
  }

  const result = await sendWhaMessage({
    deviceId: device.id,
    remoteJid,
    text: parsed.text,
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
    remote_jid: remoteJid,
  })
}
