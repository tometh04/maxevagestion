// Catalogo tipado de eventos de producto.
//
// Este archivo es la primera capa del contrato de privacidad: si un evento no
// declara un parametro, `trackEvent` no compila. `scrubParams` es la segunda
// capa, para lo que se cuele por un cast.
//
// Al agregar un evento:
//   1. Nombre en snake_case (convencion GA4).
//   2. Params solo categoricos, booleanos o buckets. NUNCA montos, nombres,
//      emails, telefonos, CUIT/DNI ni texto libre escrito por el usuario.
//   3. Registrar los params nuevos como custom definitions en la consola de GA4;
//      si no, se recolectan pero no aparecen en los reportes (y no es retroactivo).
//
// `user_id`, `org_id`, `role` y `plan` NO se repiten por evento: viajan como
// user properties desde `<AnalyticsIdentity />`.

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
}

export type AnalyticsEventName = keyof AnalyticsEventParams
