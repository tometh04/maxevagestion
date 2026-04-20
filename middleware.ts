import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ============================================
// RATE LIMITING (en memoria, por IP)
// ============================================
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 200 // máx requests por ventana
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Limpiar entradas expiradas cada 5 minutos
setInterval(() => {
  const now = Date.now()
  rateLimitMap.forEach((value, key) => {
    if (now > value.resetAt) rateLimitMap.delete(key)
  })
}, 300_000)

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 }
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 }
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count }
}

export async function middleware(req: NextRequest) {
  // Permitir webhooks de Trello sin autenticación
  if (req.nextUrl.pathname === '/api/trello/webhook') {
    return NextResponse.next()
  }

  // Permitir webhooks de Manychat sin autenticación (usa API key en header)
  if (req.nextUrl.pathname === '/api/webhooks/manychat') {
    return NextResponse.next()
  }

  // Permitir rutas públicas sin autenticación (cotizaciones, API pública)
  if (req.nextUrl.pathname.startsWith('/cotizacion/') || req.nextUrl.pathname.startsWith('/api/public/')) {
    return NextResponse.next()
  }

  // Rate limiting para rutas API
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    const { allowed, remaining } = checkRateLimit(ip)

    if (!allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intente nuevamente en un momento.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
  }

  // BYPASS LOGIN EN DESARROLLO - TODO: Remover antes de producción
  // Seguridad: en producción NUNCA aplicar el bypass aunque DISABLE_AUTH=true.
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ DISABLE_AUTH ignorada en producción — usando auth real')
  }
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
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
  let authUserId: string | null = null
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    authUserId = authUser?.id ?? null
  } catch (error: unknown) {
    // Silenciar errores de refresh token inválido/no encontrado (normal cuando no hay sesión)
    const message = error instanceof Error ? error.message : ""
    const status = error && typeof error === "object" && "status" in error ? (error as { status: number }).status : undefined
    if (message.includes('Refresh Token') ||
        message.includes('JWT') ||
        status === 401) {
      return response
    }
    console.warn('Middleware auth error:', error)
  }

  // SaaS Pilar 3 — onboarding gate.
  //
  // Si el user autenticado todavía no tiene org_id, lo mandamos a
  // /onboarding para completar el setup del tenant. Excepciones:
  //   - la propia página /onboarding y sus endpoints
  //   - /login, /auth, /api/auth (ciclo de auth)
  //   - webhooks/public (ya excluidos arriba)
  //
  // Esto evita el edge case donde un user registrado queda sin tenant y
  // llega a la app rompiendo queries que asumen org_id no-null.
  const pathname = req.nextUrl.pathname
  const isOnboardingAllowed =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/logout"

  if (authUserId && !isOnboardingAllowed) {
    // Hacemos la verificación con el mismo client (hereda la sesión del JWT
    // vía cookies). RLS sobre `users` permite al propio user leer su row.
    const { data: userRow } = await (supabase.from("users") as any)
      .select("org_id, is_active")
      .eq("auth_id", authUserId)
      .maybeSingle()

    const orgId = (userRow as any)?.org_id as string | null | undefined
    const isActive = (userRow as any)?.is_active !== false

    if (isActive && userRow && !orgId) {
      const url = req.nextUrl.clone()
      url.pathname = "/onboarding"
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|icon-192\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|json)$).*)',
  ],
}

