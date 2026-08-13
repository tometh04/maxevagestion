"use client"

// Ejecuta el `prepare` declarativo de un paso antes de medir su ancla.
//
// Existe porque varios contenedores del repo son NO controlados: los Tabs de
// settings, caja y detalle de operación usan `defaultValue`, y los grupos del
// sidebar usan `Collapsible defaultOpen`. Navegar a `?tab=afip` no cambia nada
// si el componente ya está montado — hay que clickear el trigger.

import { useCallback, useRef } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import type { StepPrepare } from "@/lib/tours/types"
import { queryVisibleAnchor, sleep } from "./use-target-rect"

const SIDEBAR_TRANSITION_MS = 220
const CLICK_POLL_MS = 40
const CLICK_CONFIRM_TIMEOUT_MS = 800
/** Cuánto se espera a que exista el control que hay que activar. */
const ANCHOR_WAIT_TIMEOUT_MS = 10000

/**
 * ¿El control de este ancla está activo ahora mismo?
 *
 * Lo usa el menú para entrar a la guía por el paso que corresponde al tab que
 * el usuario tiene abierto, en vez de arrancar siempre del principio.
 */
export function isAnchorActive(name: string): boolean {
  const el = queryVisibleAnchor(name)
  return el ? isAlreadyOpen(el) : false
}

/** Estados que significan "esto ya está abierto/activo, no lo toques". */
function isAlreadyOpen(el: HTMLElement): boolean {
  if (el.getAttribute("aria-expanded") === "true") return true
  if (el.getAttribute("aria-selected") === "true") return true
  const state = el.getAttribute("data-state")
  return state === "open" || state === "active"
}

/**
 * Activa un control como lo haría un usuario.
 *
 * `el.click()` NO sirve: solo dispara el evento `click`, y los Tabs de Radix
 * cambian de valor en `mousedown` (o en `focus`, según activationMode). O sea
 * que el tab no cambiaba nunca, el ancla del paso siguiente no aparecía y la
 * guía se salteaba pasos en cadena hasta irse de la pantalla.
 *
 * Se manda la secuencia completa para que funcione con cualquier primitiva,
 * escuche donde escuche.
 */
function activate(el: HTMLElement) {
  el.focus?.()

  const mouseInit: MouseEventInit = { bubbles: true, cancelable: true, button: 0, view: window }
  const pointerInit = { ...mouseInit, pointerId: 1, isPrimary: true, pointerType: "mouse" }

  const fire = (type: string, pointer: boolean) => {
    const event =
      pointer && typeof PointerEvent === "function"
        ? new PointerEvent(type, pointerInit)
        : new MouseEvent(type, mouseInit)
    el.dispatchEvent(event)
  }

  fire("pointerdown", true)
  fire("mousedown", false)
  fire("pointerup", true)
  fire("mouseup", false)
  fire("click", false)
}

/** Espera a que el control exista y sea visible, o se rinde al vencer el plazo. */
async function waitForAnchor(name: string): Promise<HTMLElement | null> {
  const deadline = Date.now() + ANCHOR_WAIT_TIMEOUT_MS
  for (;;) {
    const el = queryVisibleAnchor(name)
    if (el) return el
    if (Date.now() >= deadline) return null
    await sleep(CLICK_POLL_MS)
  }
}

/**
 * Espera a que la activación haya prendido de verdad.
 *
 * Antes esto era un sleep fijo de 60ms. Si el tab tardaba más en cambiar de
 * estado, el paso seguía adelante, no encontraba su ancla (el contenido del tab
 * ni siquiera estaba montado) y terminaba salteándose sin motivo.
 */
async function waitUntilOpen(el: HTMLElement): Promise<void> {
  const deadline = Date.now() + CLICK_CONFIRM_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (isAlreadyOpen(el)) return
    await sleep(CLICK_POLL_MS)
  }
}

export function useTourPrepare() {
  const sidebar = useSidebar()

  // El callback tiene que ser ESTABLE: es dependencia del efecto que resuelve
  // el ancla del paso. Si cambiara de identidad al expandir el sidebar (que es
  // justo lo que hace este prepare), el paso se re-resolvería y volvería a
  // scrollear a mitad de camino.
  const sidebarRef = useRef(sidebar)
  sidebarRef.current = sidebar

  return useCallback(
    async (prepare?: StepPrepare) => {
      if (!prepare) return

      const { state, setOpen, isMobile } = sidebarRef.current
      if (prepare.sidebar === "expand" && !isMobile && state === "collapsed") {
        setOpen(true)
        await sleep(SIDEBAR_TRANSITION_MS)
      }

      const clicks = prepare.click
        ? Array.isArray(prepare.click)
          ? prepare.click
          : [prepare.click]
        : []

      // Salir del commit de React antes de tocar nada.
      //
      // runPrepare se llama desde un useEffect y corre sincrónico hasta el
      // primer await. Activar un tab ahí dispara su onValueChange -> router.push
      // en pleno render: React tira "flushSync was called from inside a
      // lifecycle method" y el árbol se remonta, con lo que la guía perdía su
      // estado y desaparecía. Este await la manda a un macrotask limpio.
      if (clicks.length) await sleep(0)

      for (const name of clicks) {
        // Esperarlo, no buscarlo una sola vez. Cuando el paso viene de cambiar
        // de pantalla, el control todavía no está montado: al rendirse al
        // primer intento el tab nunca se activaba, su contenido nunca montaba y
        // el paso se daba por perdido aunque estuviera todo bien.
        const el = await waitForAnchor(name)
        if (!el) continue
        // Un Collapsible abierto se cerraría con un segundo click. Los Tabs son
        // idempotentes, pero el chequeo vale para ambos.
        if (isAlreadyOpen(el)) continue
        activate(el)
        await waitUntilOpen(el)
      }

      if (prepare.settleMs) await sleep(prepare.settleMs)
    },
    []
  )
}
