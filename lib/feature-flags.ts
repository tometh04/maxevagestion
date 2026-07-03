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

/**
 * Contar los servicios adicionales (operation_services) impagos como parte de
 * la venta y la deuda del cliente (cuentas por cobrar), además del viaje base
 * (operations.sale_amount_total).
 *
 * Read-time, no destructivo, reversible: solo cambia cómo se CALCULA la deuda/
 * venta al leer; no muta sale_amount_total ni pagos. Default OFF.
 *
 * Se prende por org desde Configuración → Finanzas. Antes de prenderla para una
 * org, correr scripts/audit-customer-debt-services.ts para descartar doble
 * conteo (ops "all-in" donde la venta base ya incluye el servicio).
 *
 * Touchpoints (helper getServiceExtrasByOperation en
 * lib/accounting/operation-services-debt.ts):
 *   Deuda/CxC: app/api/accounting/debts-sales, app/api/accounting/aging,
 *     app/api/accounting/payments-semaphore, app/api/analytics/pending-balances,
 *     app/api/customers/[id]/statement, app/api/operations (pending_amount),
 *     RPC accounting_debts_sales_total (app/api/accounting/debts-sales-total).
 *   Venta bruta/P&L/analytics: app/api/reports/{sales,closing,export,margins},
 *     app/api/analytics/{sales,sellers,destinations,customers,seasonality,profitability},
 *     app/api/accounting/{ganancias,monthly-position}, app/api/customers,
 *     app/api/customers/statistics, RPCs analytics_{sales,sellers,destinations}.
 *   Excluido a propósito: comisiones (los servicios ya generan su propio
 *     commission_record en el POST del servicio) y facturación/IVA (se factura
 *     sobre la venta base).
 */
export const FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL = "features.include_services_in_sale_total"
