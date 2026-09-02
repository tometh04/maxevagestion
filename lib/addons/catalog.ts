/**
 * Catálogo de complementos facturables (addons).
 *
 * Las CLAVES y la metadata de gating viven acá, en código, porque están
 * acopladas a rutas y a call sites concretos: moverlas a la DB solo daría la
 * ilusión de ser configurables. Lo que sí vive en DB (`subscription_addons`) es
 * lo que un platform admin cambia sin deploy: precio, disponibilidad y
 * enforcement.
 *
 * Es el mismo reparto que ya usa `lib/billing/plan-pricing.ts` con `PLANS` y
 * `plan_prices`: la constante es el default, la tabla la pisa por overlay, y si
 * la tabla está vacía o la query falla nada se rompe.
 *
 * Nota de nomenclatura: `app/api/quotations/[id]/addons` usa "addons" para los
 * extras de línea de una cotización (seguro, traslado). Eso es otra cosa. En la
 * UI estos se llaman "complementos" para no confundir.
 */
import type { Module } from "@/lib/permissions"

export type AddonKey =
  | "agente_blanco"
  | "emilia"
  | "growth_studio"
  | "wha_control"
  | "library"
  | "referrals"
  | "monthly_commissions"
  | "cerebro"

export interface AddonDefinition {
  key: AddonKey
  /** Nombre visible para el cliente. */
  name: string
  description: string
  category: "integraciones" | "ia" | "modulos"
  /**
   * El cliente lo prende y apaga solo desde su panel. `false` ⇒ lo SOLICITA y
   * queda pendiente hasta que un platform admin hace el setup de nuestro lado.
   */
  selfServe: boolean
  /** Copy que ve el cliente cuando el alta requiere trabajo nuestro. */
  setupNote?: string
  /**
   * Módulo de permisos con el que se ANDea. El complemento dice "la agencia lo
   * contrató"; la matriz dice "este rol puede usarlo". Un complemento NUNCA
   * amplía permisos.
   */
  module?: Module
  /**
   * El admin no puede activarlo sin `organizations.agente_blanco_org_slug`
   * cargado: cobrar por una bandeja que devuelve ADDON_DISABLED es un ticket feo.
   */
  requiresOrgSlug?: boolean
  /** Precio default ARS/mes. `subscription_addons` lo pisa. null = a consultar. */
  defaultPriceArsMonthly: number | null
  /** Rutas de dashboard que gatea. Documental, y guía del cableado del sidebar. */
  routes: string[]
}

export const ADDONS: Record<AddonKey, AddonDefinition> = {
  agente_blanco: {
    key: "agente_blanco",
    name: "Agente Blanco",
    description:
      "Bandeja unificada de Instagram y WhatsApp dentro de Vibook, con los chats de tus redes.",
    category: "integraciones",
    // El slug lo entrega el proveedor externo: no se puede autoservir.
    selfServe: false,
    setupNote:
      "Necesitamos conectar tu cuenta con Agente Blanco antes de activarlo. Te escribimos en menos de 24 h.",
    module: "leads",
    requiresOrgSlug: true,
    defaultPriceArsMonthly: null,
    routes: ["/conversaciones"],
  },
  emilia: {
    key: "emilia",
    name: "Emilia IA",
    description:
      "Asistente que busca vuelos y hoteles y arma la cotización a partir de la charla con el lead.",
    category: "ia",
    selfServe: true,
    defaultPriceArsMonthly: null,
    routes: ["/emilia"],
  },
  growth_studio: {
    key: "growth_studio",
    name: "Growth Studio",
    description:
      "Generación de piezas y campañas con IA, con el kit de marca de tu agencia.",
    category: "ia",
    selfServe: true,
    defaultPriceArsMonthly: null,
    routes: ["/growth-studio"],
  },
  wha_control: {
    key: "wha_control",
    name: "WHA Control",
    description:
      "WhatsApp multi-dispositivo: vinculás los teléfonos de la agencia y seguís las conversaciones.",
    category: "integraciones",
    // Hay que aparear el dispositivo contra el conector.
    selfServe: false,
    setupNote:
      "Hay que vincular cada dispositivo escaneando el QR. Coordinamos con vos para dejarlo andando.",
    defaultPriceArsMonthly: null,
    routes: ["/tools/wha-control"],
  },
  library: {
    key: "library",
    name: "Biblioteca",
    description:
      "Material de capacitación para tu equipo: archivos y links organizados por categoría y rol.",
    category: "modulos",
    selfServe: true,
    module: "library",
    defaultPriceArsMonthly: null,
    routes: ["/library"],
  },
  referrals: {
    key: "referrals",
    name: "Referidores",
    description:
      "Gestión de referidores, su comisión por venta y la liquidación de lo que se les paga.",
    category: "modulos",
    selfServe: true,
    module: "referrals",
    defaultPriceArsMonthly: null,
    routes: ["/referrals"],
  },
  monthly_commissions: {
    key: "monthly_commissions",
    name: "Comisiones mensuales",
    description:
      "Liquidación mensual de comisiones por vendedor, con reglas propias y simulación.",
    category: "modulos",
    selfServe: true,
    module: "commissions",
    defaultPriceArsMonthly: null,
    routes: ["/commissions-monthly", "/my/commissions-monthly"],
  },
  cerebro: {
    key: "cerebro",
    name: "Cerebro",
    description:
      "Preguntale a tus datos en castellano y obtené la respuesta sin armar el reporte.",
    category: "ia",
    selfServe: true,
    defaultPriceArsMonthly: null,
    routes: ["/tools/cerebro"],
  },
}

export const ADDON_KEYS = Object.keys(ADDONS) as AddonKey[]

export function isAddonKey(value: string | null | undefined): value is AddonKey {
  return !!value && Object.prototype.hasOwnProperty.call(ADDONS, value)
}

/** Definición del complemento, o null si la clave no existe en el catálogo. */
export function getAddon(key: string | null | undefined): AddonDefinition | null {
  return isAddonKey(key) ? ADDONS[key] : null
}
