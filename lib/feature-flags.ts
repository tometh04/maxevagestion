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

/**
 * Seguimiento automático post-cotización en WHA Control (pedido Lozada).
 *
 * Con el flag ON, el inbox de WHA Control muestra el botón "Cotización
 * enviada": marca el chat y agenda UN mensaje de seguimiento automático
 * (tabla wa_quote_followups) que el cron wha-quote-followups envía por el
 * connector si el cliente no respondió. La config (espera, texto, ventana
 * horaria) vive en wa_followup_settings, editable desde el tab Seguimientos
 * de WHA Control.
 *
 * Touchpoints:
 *   UI: app/(dashboard)/tools/wha-control/page.tsx (lee el flag y lo pasa
 *     como prop), components/tools/wha-control/{wha-control-page,inbox-view,
 *     followup-settings-form}.tsx.
 *   API: app/api/wha-control/chats/[chatId]/quote-followup (marca/cancela),
 *     app/api/wha-control/followup-settings, app/api/wha-control/chats
 *     (anexa followup al listado).
 *   Cron: app/api/cron/wha-quote-followups (re-verifica el flag al disparo:
 *     si la org lo apagó, cancela en vez de enviar).
 */
export const FEATURE_FLAG_WHA_QUOTE_FOLLOWUP = "features.wha_quote_followup"
