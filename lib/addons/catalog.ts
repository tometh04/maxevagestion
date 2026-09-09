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

/**
 * Referidores y Comisiones mensuales NO están acá a propósito: vienen con el
 * plan base y los usa la agencia que quiera. Su único gate es el permiso del
 * módulo. Si algún día se venden aparte, hay que volver a cablearlos.
 */
export type AddonKey =
  | "agente_blanco"
  | "emilia"
  | "growth_studio"
  | "wha_control"
  | "library"
  | "cerebro"

export interface AddonDefinition {
  key: AddonKey
  /** Nombre visible para el cliente. */
  name: string
  description: string
  /**
   * Tres cosas concretas que el complemento hace. Es lo que separa una vitrina
   * de una lista de settings: con una sola línea de descripción, nadie decide.
   * Van acá y no en el componente porque son copy de producto, igual que
   * `description` y `setupNote`.
   */
  highlights: string[]
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
    highlights: [
      "Instagram y WhatsApp en la misma bandeja",
      "Cada conversación queda pegada al lead",
      "Contestás sin salir de Vibook",
    ],
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
    highlights: [
      "Busca vuelos y hoteles mientras hablás con el lead",
      "Arma la cotización con lo que encontró",
      "Trabaja sobre la conversación, sin cargar nada a mano",
    ],
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
    highlights: [
      "Piezas y campañas con el kit de marca de la agencia",
      "Imágenes generadas, sin banco de fotos",
      "Todo queda guardado para reutilizar",
    ],
    category: "ia",
    selfServe: true,
    defaultPriceArsMonthly: null,
    routes: ["/growth-studio"],
  },
  wha_control: {
    key: "wha_control",
    name: "WhatsApp central",
    description:
      "WhatsApp multi-dispositivo: vinculás los teléfonos de la agencia y seguís las conversaciones.",
    highlights: [
      "Vinculás varios teléfonos de la agencia",
      "Ves y respondés las conversaciones de cada uno",
      "El historial queda en Vibook, no en el celular",
    ],
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
    highlights: [
      "Archivos y links organizados por categoría",
      "Elegís qué ve cada rol",
      "El que entra nuevo se capacita solo",
    ],
    category: "modulos",
    selfServe: true,
    module: "library",
    defaultPriceArsMonthly: null,
    routes: ["/library"],
  },
  cerebro: {
    key: "cerebro",
    name: "Cerebro",
    description:
      "Preguntale a tus datos en castellano y obtené la respuesta sin armar el reporte.",
    highlights: [
      "Preguntás en castellano y responde con tus datos",
      "No hay que armar el reporte ni exportar nada",
      "Solo lee: nunca modifica información",
    ],
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
