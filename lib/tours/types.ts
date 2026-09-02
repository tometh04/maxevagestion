// Contrato de las guías in-app (tours con spotlight).
//
// Vive en lib/ y es PURO: sin "use client", sin JSX, sin acceso a DB. Tanto los
// componentes cliente del motor como los tests importan de acá. El contenido de
// los pasos es data serializable a propósito — así el registry se puede validar
// con un test de invariantes y el copy se edita sin tocar componentes.

import type { Module } from "@/lib/permissions"

export type TourPermission = "read" | "write" | "delete" | "export"

/**
 * Preparación declarativa que corre ANTES de medir el target de un paso.
 *
 * Es data y no una función a propósito: una función no es serializable, no se
 * puede snapshot-testear y el test de invariantes del registry no la puede
 * validar. Los tres casos reales son "expandir el sidebar", "clickear un
 * trigger" (Tabs/Collapsible no controlados) y "esperar una transición".
 */
export interface StepPrepare {
  /** Expandir el sidebar si está en modo icon (solo desktop). */
  sidebar?: "expand"
  /**
   * Clickear uno o más `data-tour` antes de medir. Necesario porque los Tabs y
   * Collapsible del repo son NO controlados: navegar a `?tab=afip` no cambia el
   * tab si el componente ya está montado.
   */
  click?: string | string[]
  /** Espera extra en ms tras el prepare, para transiciones CSS. Default 0. */
  settleMs?: number
}

export interface TourStep {
  /** Único dentro del tour. */
  id: string
  /**
   * Nombre lógico del ancla — el motor busca `[data-tour="<target>"]`.
   * Nunca un selector CSS. Un array mide el rect unión de varios elementos.
   */
  target?: string | string[]
  title: string
  /** Texto plano, sin JSX ni markdown. Qué es y para qué sirve, 2-3 líneas. */
  body: string
  /**
   * Detalle plegable ("Ver más"): lo que confunde, lo que no es obvio, lo que
   * hay que saber para no equivocarse. Cada entrada es un párrafo corto.
   *
   * Va aparte del `body` a propósito: el que solo quiere recorrer la guía la
   * recorre rápido, y el que necesita entender a fondo lo tiene a un click.
   */
  details?: string[]
  /** "warning" marca el paso como advertencia. Default "info". */
  tone?: "info" | "warning"
  /** Ubicación de la tarjeta. Default "anchor": junto al elemento iluminado. */
  cardPlacement?: "anchor" | "center"
  placement?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  /** Padding del hueco alrededor del target, en px. Default 8. */
  padding?: number
  /**
   * El usuario puede clickear el target (pasos "hacé esto"). Default false:
   * el hueco queda tapado por un blocker transparente.
   */
  interactive?: boolean
  /** Navegar a esta ruta antes de correr el paso. */
  route?: string
  prepare?: StepPrepare
  /** Si el permiso no aplica, el paso se descarta antes de arrancar el tour. */
  requirePermission?: { module: Module; permission: TourPermission }
  /** Se descarta en mobile (el sidebar mobile es un Sheet modal de Radix). */
  skipOnMobile?: boolean
  /** Qué hacer si el target nunca aparece en el DOM. Default "skip". */
  onMissing?: "skip" | "center"
  /**
   * Solo para el tour de setup (scope "org"): al avanzar, marca este key como
   * completado en el estado org-scoped que alimenta el checklist del dashboard.
   */
  completesSetupKey?: string
  /**
   * En vez de avanzar al paso siguiente, arranca esta otra guía.
   *
   * Sirve para encadenar un recorrido de pantalla con una guía de carga sin
   * fusionarlos: quien solo quería ver de qué se trata la pantalla no queda
   * arrastrado a llenar un formulario de dieciséis pasos.
   */
  nextTour?: string
}

/**
 * "user": el progreso es de cada usuario (users.onboarding_state).
 * "org": el progreso es de la agencia (organization_settings) — solo el setup
 * inicial, cuyos pasos son hechos de la empresa y no de la persona.
 */
export type TourScope = "user" | "org"

/**
 * "screen" = recorrido por una pantalla. Auto-dispara y es la que ofrece el
 * menú como "la guía de esta pantalla".
 *
 * "form" = acompaña el llenado de un formulario. Nunca auto-dispara ni compite
 * por ser la guía de la pantalla: sus anclas viven dentro de un diálogo que
 * puede no estar abierto. Se llega por encadenado o eligiéndola en el menú.
 */
export type TourKind = "screen" | "form"

export interface TourDefinition {
  id: string
  title: string
  scope: TourScope
  /** Default "screen". */
  kind?: TourKind
  /**
   * Rutas que disparan este tour. `[param]` matchea cualquier segmento no
   * vacío. Un `/*` final habilita match por prefijo.
   */
  match: string[]
  /**
   * Rutas que NO deben disparar este tour aunque matcheen un patrón dinámico.
   * Necesario porque `/operations/[id]` también matchea `/operations/new` y
   * `/operations/statistics`, que son pantallas distintas.
   */
  exclude?: string[]
  /** Especificidad para desempatar. Si se omite, se deriva de los segmentos. */
  priority?: number
  autoStart: boolean
  /**
   * Ancla que debe existir para poder iniciar esta guía contextual.
   *
   * Estas guías no se listan en el menú global porque su host puede montarse y
   * desmontarse sin que el provider vuelva a renderizar. El componente host
   * ofrece el replay local y `start()` vuelve a validar el DOM en el momento
   * exacto del click, evitando consumir la guía fuera de contexto.
   */
  contextualAnchor?: string
  /** Gate por rol (para tours de configuración que solo hacen owner/admin). */
  requireRoles?: string[]
  /**
   * Qué hacer para poder verla, cuando no se puede abrir desde cualquier lado.
   * Solo aplica a guías de pantallas con ruta dinámica (el detalle de una
   * operación no tiene URL fija a la que mandar al usuario).
   */
  launchHint?: string
  steps: TourStep[]
}

/** Contexto con el que se filtran los pasos antes de arrancar un tour. */
export interface TourFilterContext {
  isMobile: boolean
  /** `(module, permission) => boolean`. Recibe la matriz YA resuelta. */
  can: (module: Module, permission: TourPermission) => boolean
}
