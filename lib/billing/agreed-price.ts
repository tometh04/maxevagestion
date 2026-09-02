/**
 * Precio pactado por organización ("grandfathering").
 *
 * Cuando sube el precio de lista de un plan estándar, las orgs que ya están
 * suscriptas siguen pagando el monto viejo: Mercado Pago congela
 * `auto_recurring.transaction_amount` en el preapproval y el template nuevo que
 * genera `ensureMpPlan` (el monto viaja en la cache key) no toca a los viejos.
 *
 * `organizations.agreed_plan_price_ars` es el registro en la app de ESE monto —
 * lo que MP efectivamente debita. No es un precio negociado abstracto: es el
 * eco de lo que MP autorizó. De ahí salen tres propiedades:
 *
 *  1. Fuente de verdad clara (MP), sin reglas de negocio que mantener.
 *  2. Modo de falla benigno: NULL ⇒ precio de lista. Nunca cobra de menos por
 *     accidente ni rompe un flujo.
 *  3. Un regularize grandfathered reusa el template MP ya cacheado.
 *
 * Precedencia de precio para una org:
 *   manual_mrr_override_ars > custom_plans > agreed_plan_price_ars > plan_prices
 *
 * Módulo puro a propósito (sin I/O): la regla se testea sin mockear Supabase,
 * igual que `isAccessAllowed`, `transitionFromMP` o `buildDowngradeUpdate`.
 */

/** Event types de `transitionFromMP` que representan un monto ya aceptado por MP. */
const PRICE_ESTABLISHING_EVENTS = new Set(["PAYMENT_APPROVED", "SUBSCRIPTION_AUTHORIZED"])

export interface AgreedPriceOrg {
  plan?: string | null
  agreed_plan_price_ars?: number | string | null
  agreed_plan_id?: string | null
}

/**
 * Precio pactado válido para `plan`. Devuelve null si no hay snapshot, si el
 * snapshot corresponde a OTRO plan (la org cambió de plan y el precio viejo ya
 * no aplica), o si el valor guardado no es un monto usable.
 *
 * El gate por plan es lo que hace que olvidarse de limpiar el snapshot en algún
 * flujo que muta `organizations.plan` sea un no-evento (cae al precio de lista)
 * en vez de un cobro incorrecto.
 *
 * PostgREST devuelve NUMERIC como string — de ahí el `Number()`.
 */
export function agreedPriceFor(
  org: AgreedPriceOrg | null | undefined,
  plan: string | null | undefined
): number | null {
  if (!org || !plan) return null
  if (!org.agreed_plan_id || org.agreed_plan_id !== plan) return null
  if (org.agreed_plan_price_ars === null || org.agreed_plan_price_ars === undefined) return null
  const value = Number(org.agreed_plan_price_ars)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export interface BuildAgreedPriceUpdateInput {
  /** Plan actual de la org (el precio se ancla a él). */
  plan: string | null | undefined
  /** `preapproval.auto_recurring.transaction_amount` — lo que MP va a debitar. */
  transactionAmount: number | null | undefined
  /** Event type resuelto por `transitionFromMP`. */
  eventType: string | null | undefined
  /** Si la org tiene custom plan, ese contrato es dueño del precio. */
  hasCustomPlan: boolean
  source: "mp_webhook" | "checkout_sync" | "admin"
  /**
   * Suma de complementos YA incluida en `transactionAmount`.
   *
   * Desde que existen los complementos facturables, MP debita `plan + addons`.
   * Esta columna, en cambio, significa "precio del PLAN BASE": la leen el
   * checkout de regularización, `/settings/subscription` y `computeBaseMrrArs`,
   * y todos ellos le suman los complementos encima. Si acá guardáramos el total,
   * el mes siguiente el "plan base" ya incluiría los addons y se volverían a
   * sumar: doble cobro compuesto y silencioso (139k → 154k → 169k → …).
   *
   * Restarlo mantiene el significado original de la columna. El valor sale de
   * `organizations.addons_mp_synced_amount_ars`, que se escribe en el mismo
   * instante en que se empuja el importe a MP, así que es consistente por
   * construcción.
   *
   * Default 0 ⇒ todos los callers y tests previos se comportan igual que antes.
   */
  addonsAmountArs?: number
}

/**
 * Parche a mergear en el UPDATE de `organizations`, o null si no corresponde
 * escribir precio. Se piggybackea en updates que ya existen — no agrega
 * round-trips ni writes propios, así que hereda las semánticas de retry del
 * caller.
 *
 * Es idempotente por naturaleza: cada notificación de la misma suscripción trae
 * el mismo `transaction_amount`, así que un replay escribe el mismo número.
 *
 * NO escribe cuando:
 *  - el evento no establece precio (un rechazo o una cancelación NO deben pisar
 *    el precio bueno que la org ya tenía),
 *  - el monto no es un número usable,
 *  - la org tiene custom plan,
 *  - no se sabe a qué plan anclarlo.
 */
export function buildAgreedPriceUpdate(
  input: BuildAgreedPriceUpdateInput
): Record<string, unknown> | null {
  if (input.hasCustomPlan) return null
  if (!input.plan) return null
  if (!input.eventType || !PRICE_ESTABLISHING_EVENTS.has(input.eventType)) return null

  const total = Number(input.transactionAmount)
  if (!Number.isFinite(total) || total <= 0) return null

  // Descontar los complementos deja el precio del plan base solo. Si el número
  // no da (addons mal sincronizados, o un monto de MP menor al esperado), no se
  // escribe nada: es preferible caer al precio de lista —el modo de falla
  // benigno que ya tenía esta columna— antes que congelar un precio inventado.
  const addons = Number(input.addonsAmountArs ?? 0)
  const amount = Number.isFinite(addons) && addons > 0 ? total - addons : total
  if (!Number.isFinite(amount) || amount <= 0) return null

  return {
    agreed_plan_price_ars: amount,
    agreed_plan_id: input.plan,
    agreed_plan_price_source: input.source,
  }
}

/**
 * Limpia el snapshot. Se usa cuando la org empieza una relación de precio nueva:
 * reactivación de una suscripción cancelada (entra a precio de lista) o cambio
 * de plan.
 */
export function clearAgreedPriceUpdate(): Record<string, null> {
  return {
    agreed_plan_price_ars: null,
    agreed_plan_id: null,
    agreed_plan_price_source: null,
  }
}
