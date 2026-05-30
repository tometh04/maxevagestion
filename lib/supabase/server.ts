import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { Database } from './types'
import { cookies } from 'next/headers'

/**
 * Cliente Supabase con SERVICE_ROLE_KEY — bypasea RLS completamente.
 *
 * ⚠️  MULTI-TENANT: este cliente NO tiene aislamiento automático por org.
 * Cualquier query SIN `.eq("org_id", orgId)` lee/escribe datos de TODOS los tenants.
 *
 * Casos legítimos (sin filtro de org):
 *   - Cron jobs — procesan todos los orgs por diseño.
 *   - Platform admin — cross-org por definición, protegido por isPlatformAdmin().
 *   - Auth flows (register, onboarding) — pre-session, no hay org_id todavía.
 *   - Webhooks server-to-server — la org se resuelve vía token en la URL.
 *   - Audit logs fire-and-forget — sin contexto de org.
 *   - Storage uploads — bucket policies son scope separado de DB RLS.
 *
 * Para operaciones dentro de un tenant conocido, preferir:
 *   import { createOrgAdminScope } from "@/lib/supabase/admin-scope"
 *   const scope = createOrgAdminScope(user.org_id)
 *   // → todas las queries llevan .eq("org_id", orgId) automáticamente
 *
 * Ver scripts/admin-client-allowlist.txt — cada archivo que usa esta función
 * debe estar listado con su justificación.
 * NUNCA exponer este cliente al browser.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function createServerClient() {
  // En desarrollo con DISABLE_AUTH, usar service role para bypasear RLS.
  // Seguridad: en producción NUNCA devolver el admin client aunque DISABLE_AUTH=true.
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ DISABLE_AUTH ignorada en producción — usando auth real')
  }
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'development') {
    return createAdminClient()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key'

  const cookieStore = await cookies()
  
  return createSupabaseServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        try {
          cookieStore.set({ name, value, ...options })
        } catch (error) {
          // The `set` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
      remove(name: string, options: any) {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch (error) {
          // The `remove` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}

