// Identidad user-scoped que se manda a GA4.
//
// Modulo puro y server-safe: lo consumen los layouts (server components) para
// construir el objeto, y el client component solo lo empuja a gtag.
//
// Contrato: SOLO IDs anonimizados. `email`, `name`, `is_independent_advisor` y
// cualquier otro campo de `users` quedan explicitamente afuera. El test
// `identity.test.ts` asserta las claves exactas justamente para que ensanchar
// este tipo rompa algo ruidosamente.

export type AnalyticsIdentity = {
  /** UUID de `users.id`. Pseudonimo, no PII directa. */
  user_id: string
  org_id: string | null
  role: string
  plan: string | null
}

type AnalyticsUserInput = {
  id: string
  org_id?: string | null
  role?: string | null
} | null | undefined

type BuildIdentityOptions = {
  /**
   * `process.env.DISABLE_AUTH === "true"`. Con el bypass activo, `getCurrentUser()`
   * devuelve un usuario hardcodeado de desarrollo; esa identidad falsa no puede
   * llegar a GA o contamina los reportes con un user_id inexistente.
   */
  disableAuth?: boolean
  /** Plan de suscripcion de la org (`organizations.plan`). */
  plan?: string | null
  /** Override de rol, para superficies fuera del tenant (ej. platform admin). */
  role?: string | null
}

export function buildAnalyticsIdentity(
  user: AnalyticsUserInput,
  opts: BuildIdentityOptions = {}
): AnalyticsIdentity | null {
  if (opts.disableAuth) return null
  if (!user?.id) return null

  return {
    user_id: user.id,
    org_id: user.org_id ?? null,
    role: opts.role ?? user.role ?? "unknown",
    plan: opts.plan ?? null,
  }
}
