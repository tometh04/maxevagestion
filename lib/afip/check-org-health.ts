/**
 * Helper server-side para detectar si el AFIP de la org tiene problemas
 * recientes que el user debería ver y atender.
 *
 * Pendientes 2026-05-07 (GTM piloto): cuando un cert AFIP vence, el
 * password de Clave Fiscal cambió en AFIP, o el PV se desautoriza,
 * todas las emisiones empiezan a fallar — pero el user no se entera
 * hasta que intenta facturar y se encuentra con el error. Este helper
 * permite mostrar un badge proactivo en la sidebar antes de que el user
 * descubra el problema en mitad de una operación.
 *
 * Heurística simple: contar failures de autorización AFIP en las últimas
 * 24 horas. Si hay 2+ failures, asumimos que NO es un user error puntual
 * (cliente sin CUIT, etc.) sino un problema de config sostenido.
 *
 * Multi-tenant safe: filtra por org_id explícito. Solo lee `invoices`
 * (que tiene RLS) y agrega.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export type AfipHealthStatus = 'ok' | 'warning' | 'error' | 'not-configured'

export interface OrgAfipHealth {
  status: AfipHealthStatus
  recentFailures: number
  lastErrorAt: string | null
  lastErrorCode: number | null
  message: string | null
}

const HEALTH_CACHE_KEY = '__vibook_org_afip_health__'

/**
 * Evalúa la salud de la integración AFIP de la org en función de los
 * últimos comprobantes intentados.
 *
 * Niveles:
 *   - 'not-configured': la org no tiene ninguna integración AFIP activa.
 *   - 'ok': sin failures recientes O sin intentos en las últimas 24hs.
 *   - 'warning': 2-3 failures en las últimas 24hs.
 *   - 'error': 4+ failures en las últimas 24hs (algo está roto sostenido).
 */
export async function getOrgAfipHealth(
  supabase: SupabaseClient<Database>,
  orgId: string | null | undefined
): Promise<OrgAfipHealth> {
  const empty: OrgAfipHealth = {
    status: 'not-configured',
    recentFailures: 0,
    lastErrorAt: null,
    lastErrorCode: null,
    message: null,
  }
  if (!orgId) return empty

  // 1) ¿Hay alguna agencia con AFIP activo? Si no → not-configured (silent,
  //    el gate de /operations/billing ya cubre este caso con CTA explícito).
  const { data: agencies } = await (supabase
    .from('agencies') as any)
    .select('id')
    .eq('org_id', orgId)
  const agencyIds = (agencies || []).map((a: any) => a.id)
  if (agencyIds.length === 0) return empty

  const { data: integrations } = await (supabase
    .from('integrations') as any)
    .select('agency_id')
    .eq('integration_type', 'afip')
    .eq('status', 'active')
    .in('agency_id', agencyIds)
  if (!integrations || integrations.length === 0) return empty

  // 2) Contar invoices de las últimas 24hs que quedaron en draft con
  //    afip_response.error (= AFIP rechazó la autorización).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentDrafts } = await (supabase
    .from('invoices') as any)
    .select('id, afip_response, created_at')
    .eq('org_id', orgId)
    .eq('status', 'draft')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  const failures = (recentDrafts || []).filter(
    (inv: any) => !!inv.afip_response?.error
  )

  if (failures.length === 0) {
    return {
      status: 'ok',
      recentFailures: 0,
      lastErrorAt: null,
      lastErrorCode: null,
      message: null,
    }
  }

  // Extraer info del último failure para el tooltip.
  const last = failures[0]
  const lastError = String(last.afip_response?.error || '')
  const codeMatch = lastError.match(/\((\d{3,5})\)/)
  const lastErrorCode = codeMatch ? parseInt(codeMatch[1], 10) : null

  // Severidad por cantidad de failures sostenidos.
  // 1 fallo en 24hs = puede ser user error puntual → ok (silent).
  // 2-3 fallos = warning (badge naranja).
  // 4+ fallos = error (badge rojo, problema serio).
  let status: AfipHealthStatus
  if (failures.length === 1) {
    status = 'ok'
  } else if (failures.length <= 3) {
    status = 'warning'
  } else {
    status = 'error'
  }

  return {
    status,
    recentFailures: failures.length,
    lastErrorAt: last.created_at,
    lastErrorCode,
    message: lastError,
  }
}
