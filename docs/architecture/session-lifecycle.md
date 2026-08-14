# Ciclo de vida de la sesion

Estado: activo desde 2026-08-14.
Alcance: auth de todo el producto.

## Politica

| Parametro | Valor | Donde vive |
|---|---|---|
| `sessions_inactivity_timeout` | 12 h | Proyecto Supabase (Auth → Sessions) |
| `sessions_timebox` | 7 dias | idem |
| `jwt_exp` | 1 h | idem |
| `refresh_token_rotation_enabled` | true | idem |

**No esta en el repo.** No hay `supabase/config.toml`, asi que estos cuatro
valores solo existen en el proyecto de Supabase. Se pueden leer y escribir por
Management API (`/v1/projects/{ref}/config/auth`).

## Que habia antes

Las sesiones **no expiraban nunca**: `sessions_timebox = 0`,
`sessions_inactivity_timeout = 0`, y la cookie de `@supabase/ssr` con su default
de 400 dias. Al momento del cambio habia **335 sesiones abiertas de 77 usuarios,
la mas vieja de hace 234 dias**, y 212 con mas de un mes.

Dos consecuencias:

1. **De seguridad**: la notebook de alguien que se fue hace ocho meses seguia con
   sesion valida.
2. **De medicion**: si nadie vuelve a loguearse, "cuanta gente entra" no se puede
   responder. Los logins solo existen cuando la sesion caduca.

## Orden de aplicacion (importa)

Activar la expiracion **reapea** las sesiones vencidas, y con ellas se va el
historial de `auth.sessions`. Por eso el orden fue:

1. `login_sessions` + el primer snapshot (334 sesiones, con `created_at` real
   desde febrero).
2. El fix de cookies del middleware (abajo).
3. Recien ahi, la politica de expiracion.

Invertir 1 y 3 habria costado seis meses de historial irrecuperable. Invertir 2 y
3 habria mezclado los deslogueos del bug con los esperados, y ante un reporte de
soporte no habria forma de distinguirlos.

## El bug de cookies del middleware

`setAll` escribe los tokens rotados en `response`, pero `NextResponse.redirect()`
arma un objeto **nuevo** que no las lleva. Con la rotacion de refresh token
activada, el server consumia el token viejo y el browser nunca recibia el nuevo:
el siguiente request llegaba con un token ya usado y, pasado el intervalo de
reuso de 10 s, la sesion se caia sola.

Se manifestaba solo cuando el refresh coincidia con un request que redirige
(onboarding, paywall, gate de platform admin), asi que era un deslogueo aleatorio
imposible de reproducir a mano. Lo arregla `redirectKeepingSession()` en
`middleware.ts`. **Cualquier redirect nuevo del middleware tiene que usarlo.**

## Historial: `login_sessions`

`auth.sessions` es efimero. `login_sessions` lo vuelve durable:

- Sincronizado por `/api/cron/sync-login-sessions` cada 15 min (Railway Cron
  Service), via la RPC `admin_sync_login_sessions()`.
- Upsert por `id`, o sea idempotente: se puede correr cuantas veces sea.
- Marca `ended_at` cuando la sesion desaparece de arriba.
- `service_role` no tiene SELECT sobre `auth.sessions` por default; la migracion
  agrega el GRANT explicito, preferido a una funcion `SECURITY DEFINER` que
  ampliaria superficie.

**Sin IP ni user agent.** La IP es dato personal y no aporta a ninguna metrica.
El user agent es inservible para clasificar dispositivo: el middleware refresca
server-side en cada request y lo pisa — al hacer el snapshot, 183 de 335 sesiones
decian `"Next.js Middleware"` o `"node"`. El dispositivo, si alguna vez hace
falta, se resuelve del lado del cliente.

## Logout

Habia **tres** implementaciones y una ruta rota:

- `app/logout/route.ts` — la que usan los `<Link>` del sidebar del admin y del
  paywall. **No existia**: los dos daban 404, y el del paywall es el caso feo
  (una org con la suscripcion vencida que quiere entrar con otra cuenta).
- `app/api/auth/logout/route.ts` — POST, para el `<form>` de onboarding/billing.
- `components/nav-user.tsx` y `components/dashboard/navbar.tsx` — `signOut()`
  client-side.

## Si hay que cambiar la politica

Un solo lugar: la config de auth del proyecto. Bajar el timebox desloguea a
todos de golpe. Subirlo no revive las sesiones ya vencidas.

Al momento de escribir esto no se verifico si el plan de Supabase permite estos
dos parametros en todos los tiers — se aplicaron sin error, pero si alguna vez
vuelven a `0` solos, ese es el motivo a descartar primero.
