"use client"

import { useEffect, useRef, useCallback } from "react"

interface PushNotificationManagerProps {
  userId: string
}

/**
 * Componente invisible que gestiona el registro del Service Worker
 * y la suscripción a push notifications.
 * Se monta en el dashboard layout.
 */
export function PushNotificationManager({ userId }: PushNotificationManagerProps) {
  const initialized = useRef(false)

  const subscribeToPush = useCallback(async () => {
    try {
      // 1. Verificar soporte
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        console.log("Push notifications no soportadas en este navegador")
        return
      }

      // 2. Registrar Service Worker
      const registration = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      // 3. Verificar permiso actual
      const permission = Notification.permission
      if (permission === "denied") {
        console.log("Push notifications bloqueadas por el usuario")
        return
      }

      // Si ya tiene permiso granted, suscribir silenciosamente
      if (permission === "granted") {
        await createPushSubscription(registration)
      }
      // Si es "default", no hacer nada automáticamente - el usuario
      // activará desde el toggle en la campanita
    } catch (error) {
      console.error("Error inicializando push notifications:", error)
    }
  }, [])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Delay para no interferir con la carga inicial
    const timer = setTimeout(() => {
      subscribeToPush()
    }, 3000)

    return () => clearTimeout(timer)
  }, [subscribeToPush])

  return null // Componente invisible
}

/**
 * Crea la push subscription y la envía al servidor
 */
export async function createPushSubscription(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      console.error("VAPID public key no configurada")
      return null
    }

    // Verificar si ya existe una subscription
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      // Crear nueva subscription
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      })
    }

    // Enviar subscription al servidor
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey("p256dh")!),
          auth: arrayBufferToBase64(subscription.getKey("auth")!),
        },
      }),
    })

    if (!response.ok) {
      console.error("Error enviando subscription al servidor")
      return null
    }

    console.log("Push subscription registrada exitosamente")
    return subscription
  } catch (error) {
    console.error("Error creando push subscription:", error)
    return null
  }
}

/**
 * Elimina la push subscription del servidor y del navegador
 */
export async function removePushSubscription(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (!subscription) return true

    // Eliminar del servidor
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })

    // Eliminar del navegador
    await subscription.unsubscribe()

    console.log("Push subscription eliminada")
    return true
  } catch (error) {
    console.error("Error eliminando push subscription:", error)
    return false
  }
}

/**
 * Solicita permiso de notificaciones y suscribe
 */
export async function requestPushPermission(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false
    }

    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      return false
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await createPushSubscription(registration)
    return subscription !== null
  } catch (error) {
    console.error("Error solicitando permiso push:", error)
    return false
  }
}

/**
 * Verifica si el usuario tiene push activo
 */
export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false
    }

    if (Notification.permission !== "granted") {
      return false
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

// --- Utilidades ---

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}
