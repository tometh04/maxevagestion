"use client"

// Resolución y seguimiento del rectángulo que ilumina el spotlight.
//
// El ciclo por paso es: preparar (abrir tabs/sidebar) → esperar a que el ancla
// exista → scrollearla al centro → esperar a que el rect se estabilice →
// mostrar. Después queda siguiendo al elemento mientras el usuario scrollea o
// redimensiona.

import { useCallback, useEffect, useRef, useState } from "react"
import type { StepPrepare, TourStep } from "@/lib/tours/types"
import { anchorSelector, stepTargets } from "@/lib/tours/anchors"

export interface TourRect {
  top: number
  left: number
  width: number
  height: number
  radius: number
}

/** "centered" = el paso no tiene ancla (intro/outro) y va como modal. */
export type TargetPhase = "idle" | "resolving" | "ready" | "centered" | "missing"

const DEFAULT_PADDING = 8
/**
 * Cuánto se espera a que aparezca un ancla dentro de la pantalla actual.
 *
 * Generoso a propósito: varias secciones (usuarios, cuentas) piden datos antes
 * de renderizar sus controles. Con un margen corto la guía las daba por
 * inexistentes y salteaba pasos válidos. Como el MutationObserver engancha el
 * ancla apenas aparece, este número solo pesa cuando el target de verdad no
 * está — y ahí demorar un poco más es preferible a saltear algo que sí estaba.
 */
const TARGET_TIMEOUT_MS = 10000
/**
 * Un paso que cambia de pantalla necesita mucho más aire: la ruta tiene que
 * navegar, resolver sus datos y montar. Con los 4s de arriba, el paso de la
 * cuenta financiera se daba por perdido antes de que la pantalla existiera, la
 * guía saltaba al siguiente y terminaba sola.
 */
const TARGET_TIMEOUT_ROUTE_MS = 15000
/**
 * Presupuesto para un paso que ya declara que puede no estar (`onMissing`).
 *
 * Esos pasos apuntan a campos condicionales del mismo formulario: o están
 * montados o no, no hay fetch ni navegación de por medio. Esperarles los 10s de
 * arriba dejaba la pantalla atenuada y sin tarjeta durante diez segundos antes
 * de saltear — se lee como que la guía se colgó.
 */
const TARGET_TIMEOUT_OPTIONAL_MS = 1200
const SETTLE_TIMEOUT_MS = 600
/** Cuánto se tolera que el ancla desaparezca antes de dar el paso por perdido. */
const REACQUIRE_GRACE_MS = 3000

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function isVisible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement) || !el.isConnected) return false
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const cs = window.getComputedStyle(el)
  return cs.visibility !== "hidden" && cs.display !== "none"
}

/**
 * Primer elemento VISIBLE con ese nombre de ancla.
 *
 * querySelector a secas no alcanza: varias pantallas montan el mismo control
 * dos veces (variantes responsive, un árbol de carga que todavía no se
 * desmontó) y la copia oculta suele venir primero en el DOM. Clickear o medir
 * un elemento de 0x0 no hace nada y el paso queda mudo.
 */
export function queryVisibleAnchor(name: string): HTMLElement | null {
  const candidates = document.querySelectorAll(anchorSelector(name))
  for (const el of Array.from(candidates)) {
    if (isVisible(el)) return el
  }
  return null
}

function queryTargets(names: string[]): HTMLElement[] {
  return names
    .map((n) => queryVisibleAnchor(n))
    .filter((el): el is HTMLElement => el !== null)
}

/** Margen mínimo entre el hueco y el borde de la pantalla. */
const VIEWPORT_MARGIN = 12
/**
 * Alto máximo del hueco como fracción del viewport. Un contenedor largo (una
 * tabla, un kanban) taparía la pantalla entera y la tarjeta no tendría dónde
 * ubicarse. Iluminamos su parte de arriba, que es la que se está explicando.
 */
const MAX_RECT_VIEWPORT_RATIO = 0.55

/** Rect unión de los elementos, con el padding del paso y el radio real del primero. */
export function computeRect(els: HTMLElement[], padding: number): TourRect | null {
  const live = els.filter((el) => el.isConnected)
  if (!live.length) return null

  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity

  for (const el of live) {
    const r = el.getBoundingClientRect()
    top = Math.min(top, r.top)
    left = Math.min(left, r.left)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }

  top -= padding
  left -= padding
  right += padding
  bottom += padding

  // Recorte al viewport: un contenedor más alto que la pantalla (una tabla
  // larga, un kanban) dejaría el hueco tapando TODO y el atenuado no se vería.
  // Iluminamos la parte visible, que es lo que el usuario está mirando.
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const cTop = Math.max(VIEWPORT_MARGIN, top)
  const cLeft = Math.max(VIEWPORT_MARGIN, left)
  const cRight = Math.min(vw - VIEWPORT_MARGIN, right)
  const cBottom = Math.min(vh - VIEWPORT_MARGIN, bottom)

  // Si el recorte degenera, el elemento quedó fuera de pantalla: devolvemos el
  // rect crudo y que el seguimiento lo reencuadre en el próximo frame.
  const clamped = cRight - cLeft > 0 && cBottom - cTop > 0

  const finalTop = clamped ? cTop : top
  const finalLeft = clamped ? cLeft : left
  const finalWidth = clamped ? cRight - cLeft : right - left
  const finalHeight = Math.min(clamped ? cBottom - cTop : bottom - top, vh * MAX_RECT_VIEWPORT_RATIO)

  // El radio se copia del elemento para que el hueco no quede cuadrado detrás
  // de una card redondeada.
  const raw = Number.parseFloat(window.getComputedStyle(live[0]).borderTopLeftRadius) || 0

  return {
    top: finalTop,
    left: finalLeft,
    width: finalWidth,
    height: finalHeight,
    radius: raw + padding,
  }
}

/** Primer ancestro que realmente scrollea. */
function nearestScrollable(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body) {
    const overflowY = window.getComputedStyle(node).overflowY
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/**
 * Trae el elemento a la vista scrolleando SOLO su contenedor.
 *
 * scrollIntoView() scrollea todos los ancestros scrollables, incluido el
 * documento, y eso arrastra el header y el sidebar del shell fuera de pantalla.
 * Acá el shell queda quieto y se mueve únicamente el panel de contenido.
 */
function scrollTargetIntoView(el: HTMLElement, smooth: boolean) {
  const container = nearestScrollable(el)
  if (!container) {
    // No siempre scrollea el panel de contenido: en varias pantallas crece a lo
    // alto y el que scrollea es el documento. Sin este fallback el paso se
    // quedaba fuera de la vista y la tarjeta apuntaba a la nada.
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: smooth ? "smooth" : "auto",
    })
    return
  }

  const containerRect = container.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()

  // Un elemento más alto que el contenedor no se puede centrar: se alinea
  // arriba, que es donde está lo que se está explicando.
  const tall = elRect.height > containerRect.height * 0.6
  const offset = tall ? 16 : (containerRect.height - elRect.height) / 2
  const top = container.scrollTop + (elRect.top - containerRect.top) - offset

  container.scrollTo({ top, behavior: smooth ? "smooth" : "auto" })
}

/** Cuánto esperar el ancla antes de darla por perdida. */
function resolveBudget(step: TourStep, navigated: boolean): number {
  // La navegación manda: la pantalla tiene que montar y traer sus datos, aunque
  // el paso además sea opcional.
  if (navigated) return TARGET_TIMEOUT_ROUTE_MS
  if (step.onMissing) return TARGET_TIMEOUT_OPTIONAL_MS
  return TARGET_TIMEOUT_MS
}

function waitForTargets(
  names: string[],
  cancelToken: { cancelled: boolean },
  timeoutMs: number
): Promise<HTMLElement[] | null> {
  return new Promise((resolve) => {
    const immediate = queryTargets(names)
    if (immediate.length) {
      resolve(immediate)
      return
    }

    let settled = false
    const finish = (value: HTMLElement[] | null) => {
      if (settled) return
      settled = true
      observer.disconnect()
      clearInterval(interval)
      clearTimeout(timeout)
      resolve(value)
    }

    const check = () => {
      if (cancelToken.cancelled) return finish(null)
      const found = queryTargets(names)
      if (found.length) finish(found)
    }

    const observer = new MutationObserver(check)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tour", "style", "class", "hidden"],
    })
    // Backstop: el observer no dispara cuando el elemento se revela por un
    // cambio de layout sin mutación de DOM (transform, resize del contenedor).
    const interval = setInterval(check, 250)
    const timeout = setTimeout(() => finish(null), timeoutMs)
  })
}

export function useStepTarget(params: {
  step: TourStep | null
  /** stepKey cambia en cada paso; fuerza reejecutar la resolución. */
  stepKey: string
  active: boolean
  /** Si este paso vino de cambiar de pantalla, se le da más tiempo al ancla. */
  navigated: boolean
  runPrepare: (prepare?: StepPrepare) => Promise<void>
}): { rect: TourRect | null; phase: TargetPhase } {
  const { step, stepKey, active, navigated, runPrepare } = params
  // La fase viaja junto al paso que la produjo.
  //
  // Guardarla suelta era una trampa: al avanzar de paso, el consumidor veía por
  // un render el veredicto del paso ANTERIOR con el stepKey NUEVO. Si ese
  // veredicto era "missing", saltaba el paso siguiente sin siquiera intentarlo,
  // y así en cadena hasta el final del tour.
  const [state, setState] = useState<{ phase: TargetPhase; key: string }>({
    phase: "idle",
    key: "",
  })
  const [rect, setRect] = useState<TourRect | null>(null)
  const elementsRef = useRef<HTMLElement[]>([])

  const stepKeyRef = useRef(stepKey)
  stepKeyRef.current = stepKey
  const navigatedRef = useRef(navigated)
  navigatedRef.current = navigated
  const setPhase = useCallback((next: TargetPhase) => {
    setState({ phase: next, key: stepKeyRef.current })
  }, [])

  // Un veredicto de otro paso todavía no vale para éste: seguimos resolviendo.
  const phase: TargetPhase = state.key === stepKey ? state.phase : "resolving"

  useEffect(() => {
    if (!active || !step) {
      setPhase("idle")
      setRect(null)
      elementsRef.current = []
      return
    }

    const cancelToken = { cancelled: false }
    let raf = 0
    let settleFallback: ReturnType<typeof setTimeout> | undefined
    setPhase("resolving")
    setRect(null)
    elementsRef.current = []

    const run = async () => {
      await runPrepare(step.prepare)
      if (cancelToken.cancelled) return

      const names = stepTargets(step)
      if (!names.length) {
        setPhase("centered")
        return
      }

      const els = await waitForTargets(names, cancelToken, resolveBudget(step, navigatedRef.current))
      if (cancelToken.cancelled) return
      if (!els) {
        setPhase("missing")
        return
      }

      elementsRef.current = els
      scrollTargetIntoView(els[0], !prefersReducedMotion())

      // Esperar a que el rect deje de moverse (scroll suave + transiciones),
      // con un techo para no colgarse si algo anima infinito.
      const padding = step.padding ?? DEFAULT_PADDING
      const startedAt = Date.now()
      let lastSignature: string | null = null
      let stableFrames = 0

      let done = false
      const conclude = () => {
        if (done || cancelToken.cancelled) return
        done = true

        // Última red: si el elemento quedó fuera de pantalla igual (un scroll
        // suave anterior que se pisó con éste, un relayout tardío), se lo trae
        // de golpe. Sin esto la tarjeta se dibuja siguiendo a un ancla que el
        // usuario no ve, y parece que la guía desapareció.
        const first = elementsRef.current[0]
        if (first?.isConnected) {
          const box = first.getBoundingClientRect()
          const offscreen = box.bottom < 0 || box.top > document.documentElement.clientHeight
          if (offscreen) first.scrollIntoView({ block: "center", behavior: "auto" })
        }

        const r = computeRect(elementsRef.current, padding)
        if (r) {
          setRect(r)
          setPhase("ready")
        } else {
          // Sin rect no hay nada que iluminar: el elemento se desmontó entre
          // que lo encontramos y lo fuimos a medir.
          setPhase("missing")
        }
      }

      const settle = () => {
        if (done || cancelToken.cancelled) return
        const r = computeRect(elementsRef.current, padding)
        const signature = r
          ? `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`
          : ""
        stableFrames = signature === lastSignature ? stableFrames + 1 : 0
        lastSignature = signature

        // Ambas salidas pasan por conclude() para que el chequeo de "quedó
        // fuera de pantalla" se aplique siempre, no solo al vencer el plazo.
        if (r && stableFrames >= 2) {
          conclude()
          return
        }
        if (Date.now() - startedAt > SETTLE_TIMEOUT_MS) {
          conclude()
          return
        }
        raf = requestAnimationFrame(settle)
      }
      raf = requestAnimationFrame(settle)

      // Red de seguridad: requestAnimationFrame no corre en pestañas en segundo
      // plano ni con la ventana minimizada. Sin esto, el paso quedaba colgado en
      // "resolving" para siempre y la guía desaparecía sin cerrarse ni avanzar.
      settleFallback = setTimeout(conclude, SETTLE_TIMEOUT_MS + 200)
    }

    // Sin este catch, cualquier excepción dentro de run() se perdía en la nada
    // y el paso quedaba en "resolving" para siempre: la guía desaparecía de la
    // pantalla sin cerrarse ni avanzar, y no había forma de saber por qué.
    void run().catch((error) => {
      if (cancelToken.cancelled) return
      // eslint-disable-next-line no-console
      console.error("[tours] falló la resolución del paso", stepKey, error)
      setPhase("missing")
    })

    return () => {
      cancelToken.cancelled = true
      if (raf) cancelAnimationFrame(raf)
      if (settleFallback) clearTimeout(settleFallback)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepKey, runPrepare])

  // Seguimiento en vivo mientras el paso está visible.
  useEffect(() => {
    if (phase !== "ready" || !step) return
    const padding = step.padding ?? DEFAULT_PADDING
    const names = stepTargets(step)
    let raf = 0
    let missingSince = 0

    /**
     * Reengancha el ancla si React reemplazó el nodo.
     *
     * Con ventana de gracia, no al primer frame: cambiar de tab en Settings
     * dispara un router.push, la página se re-renderiza y el elemento
     * desaparece por un instante. Darlo por perdido ahí hacía que el paso se
     * salteara solo, y como el siguiente estaba en otro tab pasaba lo mismo en
     * cadena: la guía se iba al final sola y navegaba de pantalla.
     */
    const reacquire = (): boolean => {
      if (elementsRef.current.some((el) => el.isConnected)) {
        missingSince = 0
        return true
      }
      const found = names.length ? queryTargets(names) : []
      if (found.length) {
        elementsRef.current = found
        missingSince = 0
        return true
      }
      if (!missingSince) missingSince = Date.now()
      if (Date.now() - missingSince > REACQUIRE_GRACE_MS) setPhase("missing")
      return false
    }

    const update = () => {
      raf = 0
      if (!reacquire()) return
      const r = computeRect(elementsRef.current, padding)
      if (r) setRect(r)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    // capture:true es la clave: capta el scroll de CUALQUIER ancestro, incluido
    // el div.flex-1.overflow-y-auto del layout, sin hardcodear un selector.
    window.addEventListener("scroll", schedule, { capture: true, passive: true })
    window.addEventListener("resize", schedule)

    const observer = new ResizeObserver(schedule)
    elementsRef.current.forEach((el) => observer.observe(el))
    observer.observe(document.documentElement)

    // Los listeners de arriba no disparan si el nodo se va sin que nadie
    // scrollee ni cambie de tamaño; este latido es el que lo detecta.
    const heartbeat = setInterval(schedule, 300)

    return () => {
      window.removeEventListener("scroll", schedule, { capture: true })
      window.removeEventListener("resize", schedule)
      observer.disconnect()
      clearInterval(heartbeat)
      if (raf) cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepKey])

  return { rect, phase }
}

/** Espera en ms, usada por el prepare declarativo. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
