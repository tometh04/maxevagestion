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
 * Habilitado solo para Oficial Testing Vibook hasta GA.
 * Touchpoints: lead-detail-dialog.tsx, /api/leads/[id]/emilia/route.ts (GET y POST).
 */
export const FEATURE_FLAG_LEAD_EMILIA_CHAT = "features.lead_emilia_chat"
