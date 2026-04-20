/**
 * SaaS Pilar 9 — Catálogo de planes.
 *
 * Fuente única de verdad para precios, límites y features por plan.
 * La tabla `organizations.plan` referencia uno de estos `id`.
 *
 * Los precios están en ARS (MercadoPago opera en moneda local). Cualquier
 * cambio acá se refleja en la UI de /settings/subscription y en el checkout.
 */

export type PlanId = "STARTER" | "PRO" | "ENTERPRISE"

export interface PlanDefinition {
  id: PlanId
  name: string
  description: string
  /** Precio mensual en ARS (pesos completos, la integración MP lo usa como es). */
  priceArsMonthly: number
  limits: {
    maxUsers: number
    maxAgencies: number
    maxOperationsPerMonth: number
  }
  features: string[]
  /** Si `true`, el plan no se puede comprar self-serve (contacto comercial). */
  contactSalesOnly?: boolean
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    description: "Para agencias que recién empiezan.",
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
      "CRM + operaciones + contabilidad básica",
      "Soporte por email",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    description: "Para agencias consolidadas con varias sucursales.",
    priceArsMonthly: 79900,
    limits: {
      maxUsers: 10,
      maxAgencies: 3,
      maxOperationsPerMonth: 500,
    },
    features: [
      "Hasta 10 usuarios",
      "3 agencias",
      "500 operaciones/mes",
      "Integración AFIP, facturación electrónica",
      "WhatsApp Control (1 número)",
      "Soporte prioritario",
    ],
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    description: "Operaciones de gran volumen con necesidades a medida.",
    priceArsMonthly: 199900,
    limits: {
      maxUsers: 999,
      maxAgencies: 99,
      maxOperationsPerMonth: 99999,
    },
    features: [
      "Usuarios, agencias y operaciones ilimitados (en la práctica)",
      "WhatsApp Control multi-número",
      "Integraciones a medida",
      "Soporte dedicado + SLA",
    ],
    contactSalesOnly: false,
  },
}

export const PLAN_ORDER: PlanId[] = ["STARTER", "PRO", "ENTERPRISE"]

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
