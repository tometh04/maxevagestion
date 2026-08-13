import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkCronAuth } from "@/lib/cron/auth"

/**
 * Retencion del event stream de uso.
 *
 * `usage_events` crece con cada navegacion de cada usuario de cada tenant: es la
 * tabla de mayor volumen del schema y la unica que no tiene un techo natural.
 * Sin purga, en un año es una tabla que nadie quiere tocar y que hace lento todo
 * lo que la lea.
 *
 * 90 dias es la ventana mas larga que ofrece la UI del mapa de calor, asi que
 * borrar mas atras no pierde nada que se pueda mirar. Para tendencias de largo
 * plazo estan las escrituras derivadas de las tablas de dominio, que son
 * retroactivas y no se borran.
 *
 * Correr diario. Es idempotente: si ya no hay nada viejo, no hace nada.
 */
export const dynamic = "force-dynamic"

const RETENTION_DAYS = 90

export async function POST(request: Request) {
  const auth = checkCronAuth(request, "usage-retention")
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()
  const admin = createAdminClient() as any

  // Cross-tenant por diseño: la purga aplica a todas las orgs por igual.
  const { count, error } = await admin
    .from("usage_events")
    .delete({ count: "exact" })
    .lt("occurred_at", cutoff)

  if (error) {
    console.error("[cron:usage-retention] delete fallo:", error.message)
    return NextResponse.json({ error: "Error purgando usage_events" }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    deleted: count ?? 0,
    cutoff,
    retention_days: RETENTION_DAYS,
  })
}
