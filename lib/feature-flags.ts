// lib/feature-flags.ts
/**
 * Feature flag keys centralizadas.
 *
 * Patrón: estas keys se consultan via `getOrgFeatureFlag()` de
 * `lib/settings/org-features.ts` contra la tabla `organization_settings`.
 *
 * Cuando un feature pasa a GA, se remueven los 3+ touchpoints que la
 * referencian. Tener la constante acá facilita el grep para encontrarlos
 * todos.
 */

/**
 * Beta: chat embebido de Emilia desde el modal del lead.
 * Touchpoints: lead-detail-dialog.tsx, /api/leads/[id]/emilia/route.ts (GET y POST),
 * /api/leads/[id]/emilia/suggested-prompt/route.ts.
 */
export const FEATURE_FLAG_LEAD_EMILIA_CHAT = "features.lead_emilia_chat"

/**
 * Beta CERRADA: además del flag de org (`features.lead_emilia_chat`), mientras
 * dure la beta el chat de Emilia se habilita SOLO para estos usuarios (por email).
 * Así, aunque la org tenga el flag prendido, ningún otro usuario de la org ve la
 * feature. Sacar de acá para abrir la beta a más usuarios.
 */
export const LEAD_EMILIA_CHAT_BETA_EMAILS = ["mypupybox@gmail.com"]

/** True si el email está en el allowlist de la beta cerrada (case-insensitive). */
export function isLeadEmiliaChatBetaUser(email: string | null | undefined): boolean {
  if (!email) return false
  return LEAD_EMILIA_CHAT_BETA_EMAILS.includes(email.trim().toLowerCase())
}
