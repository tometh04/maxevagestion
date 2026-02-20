import webpush from "web-push"

let vapidConfigured = false

/**
 * Configura VAPID de forma lazy (solo cuando se necesita)
 * para evitar errores durante el build de Next.js
 */
function ensureVapidConfigured() {
  if (vapidConfigured) return true

  const vapidEmail = process.env.VAPID_EMAIL || "mailto:maxi@maxevagestion.com"
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || ""

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("VAPID keys no configuradas — push notifications desactivadas")
    return false
  }

  try {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
    vapidConfigured = true
    return true
  } catch (error) {
    console.error("Error configurando VAPID:", error)
    return false
  }
}

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/**
 * Envía una push notification a todas las subscriptions de un usuario
 */
export async function sendPushToUser(
  supabase: any,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  // Configurar VAPID la primera vez
  if (!ensureVapidConfigured()) {
    return { sent: 0, failed: 0 }
  }

  try {
    const { data: subs, error } = await (supabase as any)
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId)

    if (error || !subs || subs.length === 0) {
      return { sent: 0, failed: 0 }
    }

    const jsonPayload = JSON.stringify(payload)

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          jsonPayload
        )
        sent++
      } catch (err: any) {
        // 410 Gone o 404 = subscription expirada, borrar
        if (err.statusCode === 410 || err.statusCode === 404) {
          await (supabase as any)
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id)
          console.log(`Push subscription ${sub.id} expirada, eliminada`)
        } else {
          console.error(`Error enviando push a ${sub.id}:`, err.statusCode || err.message)
        }
        failed++
      }
    }
  } catch (error) {
    console.error("Error en sendPushToUser:", error)
  }

  return { sent, failed }
}
