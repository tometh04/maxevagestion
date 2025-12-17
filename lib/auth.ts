import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Database } from '@/lib/supabase/types'

type User = Database['public']['Tables']['users']['Row']

export async function getCurrentUser(): Promise<{ user: User; session: { user: any } }> {
  // BYPASS LOGIN EN DESARROLLO - TODO: Remover antes de producción
  if (process.env.NODE_ENV === 'development' && process.env.DISABLE_AUTH === 'true') {
    // Retornar usuario mock para desarrollo
    const mockUser: User = {
      id: 'dev-user-id',
      auth_id: 'dev-auth-id',
      name: 'Usuario Desarrollo',
      email: 'dev@erplozada.com',
      role: 'SUPER_ADMIN',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return { user: mockUser, session: { user: { id: 'dev-auth-id' } } }
  }

  const supabase = await createServerClient()
  
  // Si estamos usando placeholders, redirigir al login
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (supabaseUrl.includes('placeholder')) {
    redirect('/login')
  }
  
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !authUser) {
    redirect('/login')
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authUser.id)
    .maybeSingle()

  const userData = user as any
  if (error || !userData || !userData.is_active) {
    redirect('/login')
  }

  return { user: userData, session: { user: authUser } }
}

export async function getUserAgencies(userId: string): Promise<Array<{ agency_id: string; agencies: { name: string; city: string; timezone: string } | null }>> {
  // BYPASS EN DESARROLLO - Retornar array vacío si falla
  if (process.env.NODE_ENV === 'development' && process.env.DISABLE_AUTH === 'true') {
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

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('user_agencies')
    .select('agency_id, agencies(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('Error fetching user agencies:', error)
    return []
  }

  return (data || []) as Array<{ agency_id: string; agencies: { name: string; city: string; timezone: string } | null }>
}

// Helper functions para verificación de roles
export function hasRole(userRole: string, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    VIEWER: 1,
    SELLER: 2,
    ADMIN: 3,
    SUPER_ADMIN: 4,
  }

  return (roleHierarchy[userRole] || 0) >= (roleHierarchy[requiredRole] || 0)
}

// NOTA: La función canAccess() fue eliminada - usar canAccessModule() de lib/permissions.ts en su lugar
