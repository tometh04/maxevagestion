import { unstable_cache } from 'next/cache'

/**
 * Sistema de caché centralizado para el ERP
 * 
 * Usa unstable_cache de Next.js que funciona tanto en desarrollo como en producción.
 * En el futuro, se puede migrar fácilmente a Vercel KV o Redis.
 */

// TTLs (Time To Live) en segundos
export const CACHE_TTL = {
  AGENCIES: 60 * 60, // 1 hora
  OPERATORS: 60 * 60, // 1 hora
  DASHBOARD_KPIS: 5 * 60, // 5 minutos
  TRELLO_CONFIG: 10 * 60, // 10 minutos
} as const

// Tags para invalidación selectiva
export const CACHE_TAGS = {
  AGENCIES: 'agencies',
  OPERATORS: 'operators',
  DASHBOARD: 'dashboard',
  TRELLO: 'trello',
} as const

/**
 * Obtener agencias con caché
 */
export async function getCachedAgencies<T>(
  fetchFn: () => Promise<T>,
  options?: { revalidate?: number }
): Promise<T> {
  return unstable_cache(
    async () => {
      return await fetchFn()
    },
    ['agencies-list'],
    {
      tags: [CACHE_TAGS.AGENCIES],
      revalidate: options?.revalidate ?? CACHE_TTL.AGENCIES,
    }
  )()
}

/**
 * Obtener operadores con caché
 */
export async function getCachedOperators<T>(
  fetchFn: () => Promise<T>,
  options?: { revalidate?: number }
): Promise<T> {
  return unstable_cache(
    async () => {
      return await fetchFn()
    },
    ['operators-list'],
    {
      tags: [CACHE_TAGS.OPERATORS],
      revalidate: options?.revalidate ?? CACHE_TTL.OPERATORS,
    }
  )()
}

/**
 * Obtener KPIs del dashboard con caché
 */
export async function getCachedDashboardKPIs<T>(
  fetchFn: () => Promise<T>,
  cacheKey: string,
  options?: { revalidate?: number }
): Promise<T> {
  return unstable_cache(
    async () => {
      return await fetchFn()
    },
    [`dashboard-kpis-${cacheKey}`],
    {
      tags: [CACHE_TAGS.DASHBOARD],
      revalidate: options?.revalidate ?? CACHE_TTL.DASHBOARD_KPIS,
    }
  )()
}

/**
 * Obtener configuración de Trello con caché
 */
export async function getCachedTrelloConfig<T>(
  fetchFn: () => Promise<T>,
  options?: { revalidate?: number }
): Promise<T> {
  return unstable_cache(
    async () => {
      return await fetchFn()
    },
    ['trello-config'],
    {
      tags: [CACHE_TAGS.TRELLO],
      revalidate: options?.revalidate ?? CACHE_TTL.TRELLO_CONFIG,
    }
  )()
}

/**
 * Invalidar caché por tag
 * 
 * NOTA: En Next.js, la invalidación se hace con revalidateTag() desde Server Actions
 * o desde Route Handlers. Esta función es solo para documentación.
 * 
 * Para invalidar, usar:
 * import { revalidateTag } from 'next/cache'
 * revalidateTag(CACHE_TAGS.AGENCIES)
 */
export { revalidateTag } from 'next/cache'

