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
  // Pilar 9 — paywall gate. Si el user tiene org_id pero la subscripción
  // está SUSPENDED / CANCELLED, o TRIAL ya venció, lo mandamos a
  // /paywall. Excepciones adicionales:
  //   - /paywall
  //   - /settings/subscription y /api/billing/*  (para que pueda pagar)
  //   - /api/billing/mp-webhook (MP llama sin auth — ya excluido por
  //     el paso de auth previo al no tener cookies)
  const pathname = req.nextUrl.pathname
  const isOnboardingAllowed =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/logout" ||
    // Platform admins no pertenecen a una org — no les forzamos onboarding.
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")

  const isPaywallAllowed =
    isOnboardingAllowed ||
    pathname.startsWith("/onboarding/billing") ||
    pathname.startsWith("/paywall") || // legacy route, mantener por compat
    pathname.startsWith("/settings/subscription") ||
    pathname.startsWith("/api/billing") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/legal") ||
    // Platform admins (Tomi) nunca quedan bloqueados
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")

  if (authUserId && !isOnboardingAllowed) {
    const { data: userRow } = await (supabase.from("users") as any)
      .select("org_id, is_active")
      .eq("auth_id", authUserId)
      .maybeSingle()

    const orgId = (userRow as any)?.org_id as string | null | undefined
    const isActive = (userRow as any)?.is_active !== false

    if (!isActive) return response

    if (userRow && !orgId) {
      const url = req.nextUrl.clone()
      url.pathname = "/onboarding"
      return NextResponse.redirect(url)
    }

    // Paywall gate — lógica debe mantenerse alineada con lib/billing/guard.ts.
    // No podemos importarla acá (middleware es Edge / no puede hacer I/O
    // complejo o importar server-side code), así que duplicamos la regla.
    if (orgId && !isPaywallAllowed) {
      const { data: orgRow } = await (supabase.from("organizations") as any)
        .select("subscription_status, current_period_ends_at, trial_ends_at, custom_plan_id")
        .eq("id", orgId)
        .maybeSingle()

      const status = (orgRow as any)?.subscription_status as string | undefined
      const periodEnds = (orgRow as any)?.current_period_ends_at as string | null | undefined
      const trialEnds = (orgRow as any)?.trial_ends_at as string | null | undefined
      const customPlanId = (orgRow as any)?.custom_plan_id as string | null | undefined
      const now = Date.now()

      let blocked = false
      if (status === "SUSPENDED" || status === "PENDING_PAYMENT") {
        blocked = true
      } else if (status === "CANCELLED") {
        blocked = !periodEnds || new Date(periodEnds).getTime() <= now
      } else if (status === "TRIAL") {
        // Legacy pre-mig157
        blocked = !trialEnds || new Date(trialEnds).getTime() <= now
      }

      if (blocked) {
        const url = req.nextUrl.clone()
        url.pathname = customPlanId ? "/settings/subscription" : "/onboarding/billing"
        return NextResponse.redirect(url)
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|icon-192\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|json)$).*)',
  ],
}

