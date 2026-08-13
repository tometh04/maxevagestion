"use client"

// Identidad user-scoped para GA4.
//
// Se monta en los layouts que ya resolvieron `getCurrentUser()`, al lado de
// `<PushNotificationManager />`. El objeto lo arma `buildAnalyticsIdentity()` en
// el server: aca no se toca `users` ni se decide que mandar.
//
// Ordering: el script de gtag vive en el root layout y esto en un layout hijo.
// React corre los effects de los hijos primero, asi que la funcion global de
// gtag puede no existir todavia — por eso `track.ts` encola en el buffer global
// en vez de invocarla. Ver el comentario del transporte en ese archivo.

import { useEffect } from "react"

import type { AnalyticsIdentity as Identity } from "@/lib/analytics/ga/identity"
import { clearAnalyticsUser, setAnalyticsUser } from "@/lib/analytics/ga/track"

export function AnalyticsIdentity({ identity }: { identity: Identity | null }) {
  const { user_id, org_id, role, plan } = identity ?? {
    user_id: null,
    org_id: null,
    role: null,
    plan: null,
  }

  useEffect(() => {
    if (!user_id) return
    setAnalyticsUser({ user_id, org_id, role: role ?? "unknown", plan })
    return () => clearAnalyticsUser()
  }, [user_id, org_id, role, plan])

  return null
}
