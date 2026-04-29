/**
 * SaaS Pilar 9 — Catálogo de planes.
 *
 * Fuente única de verdad para precios, límites y features por plan.
 * La tabla `organizations.plan` referencia uno de estos `id`.
 *
 * Alineado con la pricing de la landing (vibook.ai). Dos planes visibles:
 *   - PRO — $119.000 ARS/mes, 7 días trial gratis (cobro por MercadoPago).
 *   - Enterprise — a consultar, incluye bot de ads → CRM.
 *
 * STARTER queda en el catálogo solo por backward compat con orgs antiguos
 * que tengan ese valor en `plan`. No se ofrece como opción de compra.
 */

export type PlanId = "STARTER" | "PRO" | "ENTERPRISE"

export interface PlanDefinition {
  id: PlanId
  name: string
  description: string
  /**
   * Precio mensual en ARS. `null` para planes contact-sales-only (Enterprise).
   * MP opera en ARS, así que este valor va tal cual al createPreapproval.
   */
  priceArsMonthly: number | null
  /** Texto mostrado cuando `priceArsMonthly` es null. */
  priceLabel?: string
  /** Días de trial al arrancar. `null` = sin trial. */
  trialDays?: number | null
  limits: {
    maxUsers: number
    maxAgencies: number
    maxOperationsPerMonth: number
  }
  features: string[]
  /** Si `true`, la UI muestra "Hablar con ventas" (mailto) en vez del checkout MP. */
  contactSalesOnly?: boolean
  /** Si `true`, no se ofrece en `/settings/subscription` (legacy). */
  hidden?: boolean
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    description: "Plan legacy — no disponible para nuevos signups.",
    priceArsMonthly: 29900,
    limits: {
      maxUsers: 3,
      maxAgencies: 1,
      maxOperationsPerMonth: 50,
    },
    features: [
      "Hasta 3 usuarios",
      "1 agencia",
      "50 operaciones/mes",
    ],
    hidden: true,
  },
  PRO: {
    id: "PRO",
    name: "PRO",
    description: "Todo lo que necesitás para operar una agencia.",
    priceArsMonthly: 119000,
    trialDays: 7,
    limits: {
      maxUsers: 999,
      maxAgencies: 99,
      maxOperationsPerMonth: 99999,
    },
    features: [
      "Usuarios ilimitados",
      "Operaciones y clientes ilimitados",
      "CRM con pipeline Kanban",
      "Facturación electrónica AFIP self-serve",
      "Emilia IA — cotizaciones automáticas",
      "WhatsApp integrado (multi-dispositivo)",
      "Dashboard multi-agencia",
      "Contabilidad automática + reportes",
      "Comisiones de vendedores configurables",
      "Alertas automáticas de pagos y viajes",
      "Exportación total de tus datos",
      "Soporte prioritario",
    ],
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    description: "Para agencias que necesitan automatización total.",
    priceArsMonthly: null,
    priceLabel: "Consultar",
    limits: {
      maxUsers: 999,
      maxAgencies: 99,
      maxOperationsPerMonth: 99999,
    },
    features: [
      "Todo lo de PRO",
      "Bot de automatización Meta/Google Ads → CRM",
      "Webhook dedicado para tus fuentes de leads",
      "Onboarding 1-a-1 y migración asistida",
      "SLA garantizado + soporte 24/7",
      "Roles y permisos a medida",
      "API completa para integraciones custom",
    ],
    contactSalesOnly: true,
  },
}

/** Orden visual en /settings/subscription. STARTER queda oculto (plan legacy). */
export const PLAN_ORDER: PlanId[] = ["PRO", "ENTERPRISE"]

export function getPlan(id: string | null | undefined): PlanDefinition | null {
  if (!id) return null
  return PLANS[id as PlanId] ?? null
}

export function formatArs(amount: number): string {
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })
}

/**
 * URL de contacto comercial para planes Enterprise/custom.
 * WhatsApp con mensaje prellenado. Usa el formato wa.me/<numero>?text=<encoded>.
 * El número es el del responsable comercial — si cambia, actualizar acá.
 */
export const SALES_CONTACT_URL =
  "https://wa.me/5492954602920?text=" +
  encodeURIComponent("Hola! Quiero más información sobre el plan Enterprise de Vibook")
