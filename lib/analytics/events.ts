// Catalogo tipado de eventos de producto. FUENTE DE VERDAD UNICA.
//
// Vivia en `ga/events.ts`, pero ya no es solo de Google: hoy cada evento declara
// a que sinks va (`EVENT_SINKS`). El patron es el mismo que usan Segment,
// PostHog o Amplitude — un tracking plan, muchos destinos — y evita el final
// tipico de estas cosas: dos catalogos que se desincronizan y nadie sabe cual
// mide bien.
//
// Este archivo es la primera capa del contrato de privacidad: si un evento no
// declara un parametro, `trackEvent` no compila. `scrubParams` es la segunda
// capa, para lo que se cuele por un cast, y corre para AMBOS sinks.
//
// Al agregar un evento:
//   1. Nombre en snake_case (convencion GA4).
//   2. Params solo categoricos, booleanos o buckets. NUNCA montos, nombres,
//      emails, telefonos, CUIT/DNI ni texto libre escrito por el usuario.
//   3. Declararlo en `EVENT_SINKS` (el Record es exhaustivo: si falta, no
//      compila).
//   4. Si va a `ga`: registrar los params nuevos como custom definitions en la
//      consola de GA4; si no, se recolectan pero no aparecen en los reportes (y
//      no es retroactivo).
//
// `user_id`, `org_id`, `role` y `plan` NO se repiten por evento: en GA viajan
// como user properties desde `<AnalyticsIdentity />`, y en la DB los resuelve el
// endpoint desde la sesion.

import type { ModuleKey } from "./modules"

/** Pantalla desde la que se dispara el evento. Permite desambiguar flujos duplicados. */
export type AnalyticsSurface =
  | "onboarding"
  | "paywall"
  | "settings"
  | "payments"
  | "operation_detail"
  | "invoices"
  | "billing_new"
  | "billing_credit_note"
  | "cerebro"

export type AnalyticsResult = "success" | "partial" | "error"

export type AnalyticsEventParams = {
  login: { method: "password" }
  sign_up: { method: "email" }

  /**
   * `has_billing_contact` / `has_tax_id` y no `has_billing_email` / `has_cuit`:
   * `scrubParams` descarta por fragmento de clave, y "email"/"cuit" estan en el
   * denylist. El booleano es seguro, el nombre de la clave no lo parecia.
   */
  onboarding_org_created: {
    plan_id: string
    has_billing_contact: boolean
    has_tax_id: boolean
  }

  plan_selected: { plan_id: string; surface: AnalyticsSurface }
  checkout_started: { plan_id: string; regularize: boolean; surface: AnalyticsSurface }
  checkout_returned: { plan_id?: string; result: "done" | "pending" | "failed" }

  lead_created: { source_channel: string; has_agency_assigned: boolean }
  lead_stage_changed: { from_stage: string; to_stage: string; board: "manychat" | "native" }
  /** `had_quote` y no `had_quoted_price`: "price" esta en el denylist del scrubber. */
  lead_converted: { sale_currency: string; had_quote: boolean }

  operation_created: {
    passengers_bucket: string
    services_bucket: string
    multi_operator: boolean
    sale_currency: string
    from_lead: boolean
    had_warnings: boolean
  }

  /**
   * `payment_currency` y no `currency`: `currency` es un parametro RESERVADO de
   * GA4 (esquema de ecommerce, va junto a `value`). Google lo recolecta pero no
   * deja registrarlo como dimension custom, asi que el dato nunca seria visible
   * en un reporte. Mismo motivo para no usar `value`, `items` o `transaction_id`.
   */
  payment_registered: {
    payment_currency: string
    payment_method: string
    requires_approval: boolean
    surface: AnalyticsSurface
  }
  payment_marked_paid: { payment_currency: string; surface: AnalyticsSurface }

  /**
   * A proposito NO lleva el detalle del rechazo de AFIP: la respuesta viene como
   * mensaje libre y repite razon social, CUIT e importes del receptor. Para
   * diagnosticar un rechazo puntual estan los logs de invoices, no GA.
   * `invoice_kind` es el `cbte_tipo` numerico de AFIP como string.
   */
  invoice_authorized: {
    invoice_kind: string
    result: "success" | "error"
    surface: AnalyticsSurface
  }

  quotation_created: { mode: "create" | "edit"; sent: boolean; items_bucket: string }

  import_run: { entity: string; rows_bucket: string; result: AnalyticsResult }

  /** Nunca el prompt: suele traer nombres de clientes. */
  ai_query_submitted: { surface: AnalyticsSurface; has_context: boolean }

  // ── Eventos de LECTURA ───────────────────────────────────────────────────
  // El mapa de calor deriva las escrituras de las tablas, asi que estos eventos
  // cubren exactamente lo que las tablas no pueden saber: quien MIRA que.
  // Van solo al sink `db`.
  //
  // Regla que sostiene el diseño: si la accion ya deja una fila en una tabla,
  // NO se emite evento de DB. Si no, el heatmap contaria lo mismo dos veces.

  /** Navegacion a un modulo. Lo emite `<AnalyticsPageView />`, no hay call sites. */
  module_viewed: { module: ModuleKey }
  /**
   * Vista sin URL propia: un tab o un dialog pesado.
   *
   * Existe porque el pathname no alcanza. `/reports` es UNA ruta con doce
   * vistas atras, `/operations/:id` tiene nueve, y el builder de cotizaciones
   * vive dos modales por debajo de `/sales/leads` — o sea que cotizar hoy se
   * contabiliza como CRM.
   */
  view_opened: { module: ModuleKey; view_kind: "tab" | "dialog"; view: string }
  /** Apertura del detalle de una entidad (operacion, lead, cliente). */
  record_opened: { module: ModuleKey; entity: string }
  /** Export de datos. Nunca los filtros aplicados: pueden llevar nombres. */
  report_exported: { module: ModuleKey; format: "pdf" | "csv" | "xlsx" }
}

export type AnalyticsEventName = keyof AnalyticsEventParams

/** Destinos posibles de un evento. */
export type AnalyticsSink = "ga" | "db"

/**
 * A donde va cada evento.
 *
 * `ga`: comportamiento agregado, funnels, adquisicion. Lo comen los ad blockers
 *       en un 20-40% y no se puede cruzar contra billing.
 * `db`: `usage_events`. Exacto, por tenant, cruzable. Solo para lo que las
 *       tablas de dominio NO registran ya por si mismas.
 *
 * El Record es exhaustivo a proposito: un evento nuevo sin sink declarado rompe
 * el build en vez de perderse en silencio.
 */
export const EVENT_SINKS: Record<AnalyticsEventName, readonly AnalyticsSink[]> = {
  // `login` no deja fila en ninguna tabla de dominio, asi que va tambien a la
  // DB: sin esto, "cuanta gente entra por dia" no se puede responder. Se emite
  // desde el SERVER (ver SERVER_ONLY_DB_EVENTS).
  login: ["ga", "db"],
  sign_up: ["ga"],
  onboarding_org_created: ["ga"],
  plan_selected: ["ga"],
  checkout_started: ["ga"],
  checkout_returned: ["ga"],
  lead_created: ["ga"],
  lead_stage_changed: ["ga"],
  lead_converted: ["ga"],
  operation_created: ["ga"],
  payment_registered: ["ga"],
  payment_marked_paid: ["ga"],
  invoice_authorized: ["ga"],
  quotation_created: ["ga"],
  import_run: ["ga"],
  // Cerebro no deja una fila propia por consulta, asi que este si va a la DB:
  // sin esto, el uso de la IA es invisible por agencia.
  ai_query_submitted: ["ga", "db"],
  module_viewed: ["db"],
  view_opened: ["db"],
  record_opened: ["db"],
  report_exported: ["db"],
}

/**
 * Eventos con sink `db` que el BROWSER no debe emitir: los manda el server.
 *
 * Hoy solo `login`, y el motivo es concreto: el call site vive en
 * `components/login-form.tsx`, y `canEmit()` descarta todo lo que ocurra en
 * `/login` porque esa ruta no es uso de tenant. O sea que el evento ya se
 * descarta — pero por accidente.
 *
 * Un comportamiento correcto por accidente es un bug esperando el refactor que
 * lo rompa: el dia que alguien saque `/login` de `NON_TENANT_PREFIXES`,
 * empezarian a entrar logins duplicados sin que nadie lo note. Este set lo hace
 * explicito y hay un test que lo fija.
 */
export const SERVER_ONLY_DB_EVENTS: ReadonlySet<AnalyticsEventName> = new Set<AnalyticsEventName>([
  "login",
])

/**
 * Modulo al que se imputa el evento cuando sus params no traen uno.
 *
 * Sin esto, `ai_query_submitted` entraria a `usage_events` con `module = null` y
 * quedaria fuera de la matriz del heatmap — visible en la tabla cruda, invisible
 * donde se mira.
 */
export const DEFAULT_EVENT_MODULE: Partial<Record<AnalyticsEventName, ModuleKey>> = {
  ai_query_submitted: "ai",
}

/** Nombres aceptados por el endpoint de telemetria. Todo lo demas se descarta. */
export const DB_EVENT_NAMES: readonly AnalyticsEventName[] = (
  Object.keys(EVENT_SINKS) as AnalyticsEventName[]
).filter((name) => EVENT_SINKS[name].includes("db"))

export function isDbEventName(name: string): name is AnalyticsEventName {
  return (DB_EVENT_NAMES as readonly string[]).includes(name)
}

export function sinksFor(name: AnalyticsEventName): readonly AnalyticsSink[] {
  return EVENT_SINKS[name] ?? []
}
