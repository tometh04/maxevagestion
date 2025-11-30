import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key'

// Solo lanzar error si estamos en producción y faltan las variables
if (process.env.NODE_ENV === 'production' && (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder'))) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

