import { redirect } from 'next/navigation'
import { resolveHomeForSession } from '@/lib/auth/home-route'

/**
 * Raiz de la app. Con sesion viva entra directo a la pantalla que le
 * corresponde a cada uno; sin sesion, al login.
 *
 * Antes mandaba siempre a `/login`, asi que abrir app.vibook.ai en una pestaña
 * nueva estando logueado mostraba el formulario de login.
 */
export const dynamic = 'force-dynamic'

export default async function Home() {
  redirect((await resolveHomeForSession()) ?? '/login')
}
