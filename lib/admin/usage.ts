// Mapa de calor de uso del producto (platform admin).
//
// Los datos salen de las RPC `admin_usage_*` (ver
// supabase/migrations/20260813000010_admin_usage_heatmap.sql), que derivan la
// actividad de las escrituras que ya existen en cada bounded context. Este
// modulo tiene el catalogo de modulos y las funciones puras de presentacion:
// nada de negocio, nada de plata.

import { PRODUCT_MODULES, type ModuleKey } from "@/lib/analytics/modules"

export type UsageModuleKey = ModuleKey

/**
 * Columnas del heatmap. Es la MISMA lista que usa la telemetria para resolver
 * `module_viewed` desde el pathname: si fueran dos listas, un modulo nuevo
 * aparecería en lecturas y no en escrituras y el mapa mentiria en silencio.
 */
export const USAGE_MODULES = PRODUCT_MODULES

/** Senal que se pinta en la matriz. */
export type UsageSignal = "writes" | "reads"

/** `ingestion` (leads que entran por webhook) no es uso de la app: no va en el heatmap. */
export const INGESTION_MODULE = "ingestion"

export type UsageByOrgModuleRow = {
  org_id: string
  module: string
  events: number
  actors: number
  last_event_at: string | null
}

export type UsageByOrgRow = {
  org_id: string
  org_name: string | null
  slug: string | null
  subscription_status: string | null
  plan: string | null
  org_created_at: string | null
  events: number
  user_events: number
  actors: number
  active_days: number
  modules_used: number
  last_event_at: string | null
}

export type UsageByHourRow = { dow: number; hour: number; events: number }
export type UsageDailyRow = { day: string; events: number; active_orgs: number }

/**
 * Intensidad 0-5 para el color de la celda.
 *
 * Escala logaritmica y no lineal a proposito: los volumenes estan sesgados por
 * ordenes de magnitud (un import de clientes mete 6.500 filas en un dia, y una
 * agencia entera factura 200 en un mes). En escala lineal ese import pinta una
 * sola celda y deja todo el resto del mapa en blanco, que es justo lo contrario
 * de lo que el mapa tiene que mostrar.
 */
export function heatLevel(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) return 0
  const ratio = Math.log1p(value) / Math.log1p(max)
  return Math.min(5, Math.max(1, Math.ceil(ratio * 5)))
}

/** Dias enteros transcurridos desde `iso`. `null` si nunca hubo actividad. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000))
}

export type UsageHealth = {
  key: "active" | "cooling" | "dormant" | "never"
  label: string
  /** Clases de token semantico. El label ya lleva el significado; el color es redundante. */
  className: string
}

const HEALTH: Record<UsageHealth["key"], UsageHealth> = {
  active: {
    key: "active",
    label: "Activa",
    className: "bg-success/20 text-success border border-success/40",
  },
  cooling: {
    key: "cooling",
    label: "En baja",
    className: "bg-accent-coral/15 text-accent-coral border border-accent-coral/30",
  },
  dormant: {
    key: "dormant",
    label: "Dormida",
    className: "bg-destructive/15 text-destructive border border-destructive/30",
  },
  never: {
    key: "never",
    label: "Sin uso",
    className: "bg-muted-foreground/15 text-muted-foreground border border-border/60",
  },
}

/**
 * Clasifica el estado de uso de una org.
 *
 * Ojo al leerlo: mide uso, no cobranza. Una org ACTIVE en billing que aparece
 * "Dormida" es el caso interesante — paga y no usa. El cruce contra
 * `subscription_status` lo hace la tabla, no esta funcion.
 */
export function classifyUsage(
  lastEventAt: string | null,
  now: Date = new Date()
): UsageHealth {
  const days = daysSince(lastEventAt, now)
  if (days === null) return HEALTH.never
  if (days <= 3) return HEALTH.active
  if (days <= 14) return HEALTH.cooling
  return HEALTH.dormant
}

export const DOW_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]

/**
 * Rampa secuencial de un solo tono (el `--primary` de Vibook, 232deg), claro ->
 * oscuro, indexada por `heatLevel()`. Un solo hue porque el dato es magnitud:
 * dos colores dirian "polaridad" y un arcoiris no diria nada.
 *
 * Son valores fijos de light mode y no tokens porque `/admin` corre siempre bajo
 * `.light-force`. Si algun dia esto se muestra dentro del dashboard del tenant,
 * hay que darle una rampa dark antes.
 */
export const USAGE_RAMP = [
  { bg: "hsl(232 20% 96%)", fg: "hsl(232 10% 62%)" }, // 0 — sin actividad
  { bg: "hsl(232 76% 94%)", fg: "hsl(232 45% 32%)" },
  { bg: "hsl(232 76% 86%)", fg: "hsl(232 50% 28%)" },
  { bg: "hsl(232 74% 74%)", fg: "hsl(232 60% 20%)" },
  { bg: "hsl(232 76% 58%)", fg: "hsl(0 0% 100%)" },
  { bg: "hsl(232 72% 43%)", fg: "hsl(0 0% 100%)" },
]

export function formatCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`
  return String(n)
}

export function formatLastSeen(iso: string | null, now: Date = new Date()): string {
  const days = daysSince(iso, now)
  if (days === null) return "—"
  if (days === 0) return "Hoy"
  if (days === 1) return "Ayer"
  return `Hace ${days} d`
}
