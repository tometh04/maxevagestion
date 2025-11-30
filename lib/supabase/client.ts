import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key'

// No lanzar error durante el build - solo usar placeholders si faltan las variables
// El error se manejará en runtime cuando se intente usar

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

