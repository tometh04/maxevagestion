import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // BYPASS LOGIN EN DESARROLLO - TODO: Remover antes de producción
  if (process.env.NODE_ENV === 'development' && process.env.DISABLE_AUTH === 'true') {
    return NextResponse.next()
  }

  // Si faltan las variables de entorno, permitir continuar (se manejará en runtime)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key'

  // Si son placeholders, no intentar autenticación
  if (supabaseUrl.includes('placeholder') || supabaseAnonKey.includes('placeholder')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  try {
    await supabase.auth.getUser()
  } catch (error) {
    // Si falla la autenticación, continuar sin error (se manejará en las páginas)
    console.warn('Middleware auth error:', error)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

