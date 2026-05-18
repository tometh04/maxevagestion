/**
 * Adapter del payload REAL que Callbell envía a webhook URLs.
 *
 * Callbell NO envuelve el evento en `{ type, data: { contact: ... } }` como
 * asumimos al implementar el handler originalmente. Cada tipo de evento llega
 * con un shape distinto en el ROOT, sin un campo `type` explícito.
 *
 * Shapes observados (capturados desde dash.callbell.eu/settings/api_settings/events):
 *
 * 1) "Contacto creado":
 *    {
 *      "uuid": "<contact_uuid>",
 *      "name": "Tomas",
 *      "phoneNumber": "5492954602920",      // <-- sin "+" prefix
 *      "tags": [], "team": {...}, "source": "whatsapp",
 *      "channel": { "type": "whatsapp", "uuid": "<channel_uuid>", ... },
 *      "createdAt": "...", "assignedUser": null, ...
 *    }
 *
 * 2) "Mensaje creado":
 *    {
 *      "uuid": "<message_uuid>",
 *      "to": "5492954602920",
 *      "from": "5492617255027",
 *      "text": "Hola...",
 *      "status": "sent",
 *      "channel": "whatsapp",               // <-- aquí es string, no object
 *      "contact": { uuid, name, phoneNumber, ... } // shape del contacto anidado
 *    }
 *
 * Este adapter detecta el shape y devuelve un CallbellWebhookEvent
 * normalizado que el sync-handler espera. También normaliza phoneNumber al
 * formato E.164 (con "+" prefix) para que matchee con contact_phone en BD.
 */
import type { CallbellWebhookEvent, CallbellContact } from "./types"

export function adaptCallbellWebhook(
  raw: unknown
): CallbellWebhookEvent | null {
  if (raw === null || raw === undefined) return null

  // Caso "wrapper array" — algunos webhook delivery systems envuelven el evento
  // en un array `[{...}]`. Si llega así, procesamos el primer item.
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null
    return adaptCallbellWebhook(raw[0])
  }

  if (typeof raw !== "object") return null
  const body = raw as Record<string, unknown>

  // Log defensivo: si el payload tiene shape inesperado, deja un trace de los
  // top-level keys para diagnosticar (Railway logs).
  const logKeys = Object.keys(body).slice(0, 12)

  // Caso 1: ya viene en formato "rico" CallbellWebhookEvent (tests, curl manual).
  if (
    typeof body.type === "string" &&
    body.data &&
    typeof body.data === "object"
  ) {
    return body as unknown as CallbellWebhookEvent
  }

  // Caso 2: "Mensaje creado" — top-level tiene text + contact subkey
  if (typeof body.text === "string" && body.contact) {
    const messageText = body.text
    const contactRaw = body.contact as Record<string, unknown>
    return {
      type: "message_created",
      uuid:
        typeof body.uuid === "string"
          ? body.uuid
          : `cb-msg-${Date.now()}`,
      timestamp:
        typeof body.createdAt === "string"
          ? body.createdAt
          : new Date().toISOString(),
      data: {
        contact: normalizeContact(contactRaw),
        message: {
          text: messageText,
          status: body.status,
          from: body.from,
          to: body.to,
        },
      },
    }
  }

  // Caso 3: "Contacto creado" — campos del contacto en ROOT (sin wrapper "contact")
  if (
    typeof body.phoneNumber === "string" &&
    typeof body.name === "string" &&
    typeof body.uuid === "string"
  ) {
    return {
      type: "contact_created",
      uuid: body.uuid,
      timestamp:
        typeof body.createdAt === "string"
          ? body.createdAt
          : new Date().toISOString(),
      data: {
        contact: normalizeContact(body),
      },
    }
  }

  // Caso 4: fallback permisivo — si tiene contact.phoneNumber en cualquier sub-key
  // ("contact", "data.contact", etc.), tratamos como message_created (sin text)
  // o contact_created según haya text. Cubre variantes de Callbell que no documenta.
  const contactCandidate =
    (body.contact && typeof body.contact === "object"
      ? (body.contact as Record<string, unknown>)
      : null) ??
    (body.data &&
    typeof body.data === "object" &&
    (body.data as Record<string, unknown>).contact &&
    typeof (body.data as Record<string, unknown>).contact === "object"
      ? ((body.data as Record<string, unknown>).contact as Record<
          string,
          unknown
        >)
      : null)

  if (
    contactCandidate &&
    typeof contactCandidate.phoneNumber === "string"
  ) {
    const messageText =
      typeof body.text === "string" ? body.text : undefined
    return {
      type: messageText ? "message_created" : "contact_created",
      uuid:
        typeof body.uuid === "string"
          ? body.uuid
          : `cb-fallback-${Date.now()}`,
      timestamp:
        typeof body.createdAt === "string"
          ? body.createdAt
          : new Date().toISOString(),
      data: {
        contact: normalizeContact(contactCandidate),
        ...(messageText
          ? {
              message: {
                text: messageText,
                status: body.status,
                from: body.from,
                to: body.to,
              },
            }
          : {}),
      },
    }
  }

  // Caso 5: payload no reconocido — log y devolvemos null
  console.warn(
    `[callbell-adapter] payload no reconocido. top-level keys: ${JSON.stringify(logKeys)}`
  )
  return null
}

/**
 * Normaliza el contacto al shape CallbellContact que usa el resto del código.
 * Garantiza phoneNumber con prefijo "+" (formato E.164).
 */
function normalizeContact(raw: Record<string, unknown>): CallbellContact {
  let phone =
    typeof raw.phoneNumber === "string" ? raw.phoneNumber : ""
  if (phone && !phone.startsWith("+")) {
    phone = "+" + phone
  }

  const channelType =
    typeof raw.channel === "string"
      ? raw.channel
      : raw.channel &&
          typeof raw.channel === "object" &&
          typeof (raw.channel as Record<string, unknown>).type === "string"
        ? ((raw.channel as Record<string, unknown>).type as string)
        : typeof raw.source === "string"
          ? (raw.source as string)
          : "whatsapp"

  return {
    uuid:
      typeof raw.uuid === "string" ? raw.uuid : `cb-${Date.now()}`,
    name: typeof raw.name === "string" ? raw.name : "Sin nombre",
    phoneNumber: phone,
    email: typeof raw.email === "string" ? raw.email : null,
    channel: channelType as CallbellContact["channel"],
    tags: Array.isArray(raw.tags)
      ? (raw.tags as CallbellContact["tags"])
      : [],
    funnelStage: (raw.funnelStage ??
      null) as CallbellContact["funnelStage"],
    assignedAgent: (raw.assignedUser ??
      raw.assignedAgent ??
      null) as CallbellContact["assignedAgent"],
    createdAt:
      typeof raw.createdAt === "string"
        ? raw.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : typeof raw.createdAt === "string"
          ? raw.createdAt
          : new Date().toISOString(),
  }
}
