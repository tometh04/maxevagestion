import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Database } from '@/lib/supabase/types'
import { makeTimer } from '@/lib/perf-log'
import type { UserRole } from '@/lib/permissions'

type UserRow = Database['public']['Tables']['users']['Row']
// Extiende el tipo de DB con el campo `roles` (array fusionado de role + additional_roles)
// que se computa en getCurrentUser() y evita re-calcular en cada caller.
export type User = UserRow & { roles: UserRole[] }

// React.cache deduplica DENTRO del mismo request. Multi-tenant safe:
// per-request scope, no global; distintos users = distintas cookies =
// distintos requests = distinto cache.
export const getCurrentUser = cache(async (): Promise<{ user: User; session: { user: any } }> => {
  // BYPASS LOGIN EN DESARROLLO - TODO: Remover antes de producción
  // Seguridad: si DISABLE_AUTH=true pero NODE_ENV=production, ignoramos la flag.
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ DISABLE_AUTH ignorada en producción — usando auth real')
  }
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'development') {
    // Retornar usuario mock para desarrollo (usar IDs reales para evitar errores de UUID)
    const mockUser: User = {
      // Dev: usuario REAL (SUPER_ADMIN) de la org Oficial Testing Vibook.
      // Debe existir en `users` para no violar FKs (quotations.seller_id,
      // created_by, conversations, etc.) y tener la beta `features.lead_emilia_chat`
      // activada, así el chat de Emilia abre en dev Y la cotización se crea.
      // Un mock con id/org inexistentes hace que los endpoints org-scoped
      // devuelvan 400 y los inserts con FK al user fallen.
      id: '4da8ab16-d81c-4c03-88c6-f4f1da740b61',
      auth_id: '8bb59fad-db45-47f6-b411-be1b44101fb4',
      org_id: '410ada50-d8ae-4d18-8c90-36a9223b378b',
      name: 'Usuario Desarrollo',
      email: 'mypupybox@gmail.com',
      role: 'SUPER_ADMIN',
      is_active: true,
      can_view_agency_operations_support: false,
      can_add_services_on_agency_operations: false,
      default_commission_percentage: null,
      legal_accepted_at: null,
      legal_version: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      roles: ['SUPER_ADMIN'],
    }
    return { user: mockUser, session: { user: { id: '8bb59fad-db45-47f6-b411-be1b44101fb4' } } }
  }

  const t = makeTimer('getCurrentUser')
  const supabase = await createServerClient()
  t.mark('createServerClient')

  // Si estamos usando placeholders, redirigir al login
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (supabaseUrl.includes('placeholder')) {
    redirect('/login')
  }

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  t.mark('auth.getUser')

  if (authError || !authUser) {
    redirect('/login')
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authUser.id)
    .maybeSingle()
  t.mark('select users')

  const userData = user as any
  if (error || !userData || !userData.is_active) {
    redirect('/login')
  }

  // Fusionar rol primario + roles adicionales en un array deduplicado.
  // Los callers que usen `user.roles` obtienen automáticamente soporte multi-rol
  // sin necesidad de modificar el resto del código que usa `user.role`.
  const rawRoles: string[] = [userData.role, ...(userData.additional_roles ?? [])]
  const roles = Array.from(new Set(rawRoles)) as UserRole[]

  t.end(`role=${userData.role} roles=${roles.length}`)
  return { user: { ...userData, roles }, session: { user: authUser } }
})

export const getUserAgencies = cache(async (userId: string): Promise<Array<{ agency_id: string; agencies: { name: string; city: string; timezone: string } | null }>> => {
  // BYPASS EN DESARROLLO - Retornar array vacío si falla
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'development') {
    try {
      const supabase = await createServerClient()
      const { data: agencies } = await supabase
        .from('agencies')
        .select('id, name, city, timezone')
        .limit(2)
      
      if (!agencies || agencies.length === 0) {
        return []
      }
      
      return agencies.map((agency: any) => ({
        agency_id: agency.id,
        agencies: {
          name: agency.name || 'Sin nombre',
          city: agency.city || 'Sin ciudad',
          timezone: agency.timezone || 'UTC',
        },
      }))
    } catch (error) {
      // Si falla, retornar array vacío
      return []
    }
  }

  const t = makeTimer('getUserAgencies')
  const supabase = await createServerClient()
  t.mark('createServerClient')
  const { data, error } = await supabase
    .from('user_agencies')
    .select('agency_id, agencies(*)')
    .eq('user_id', userId)
  t.mark('select user_agencies+nested')

  if (error) {
    console.error('Error fetching user agencies:', error)
    t.end('error')
    return []
  }

  t.end(`count=${data?.length ?? 0}`)
  return (data || []) as Array<{ agency_id: string; agencies: { name: string; city: string; timezone: string } | null }>
})

// Helper functions para verificación de roles
export function hasRole(userRole: string, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    VIEWER: 1,
    SELLER: 2,
    ADMIN: 3,
    SUPER_ADMIN: 4,
    ORG_OWNER: 4, // SaaS Pilar 4 — alias de SUPER_ADMIN a nivel de jerarquía.
  }

  return (roleHierarchy[userRole] || 0) >= (roleHierarchy[requiredRole] || 0)
}

// NOTA: La función canAccess() fue eliminada - usar canAccessModule() de lib/permissions.ts en su lugar
