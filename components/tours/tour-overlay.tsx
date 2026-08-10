"use client"

// Se monta una sola vez en el layout del dashboard. Junta las tres piezas:
// navegación entre pasos cross-route, resolución del ancla y render del
// atenuado + la tarjeta.

import { useCallback, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { normalizePath } from "@/lib/tours/registry"
import { stepTargets } from "@/lib/tours/anchors"
import { shouldSkipMissingStep } from "@/lib/tours/skip-chain"
import { useTours } from "./tours-provider"
import { useTourPrepare } from "./use-tour-prepare"
import { queryVisibleAnchor, useStepTarget } from "./use-target-rect"
import { useModalContext } from "./use-modal-open"
import { TourSpotlight } from "./tour-spotlight"
import { TourCard } from "./tour-card"

export function TourOverlay() {
  const {
    activeTour,
    activeStep,
    stepIndex,
    visibleSteps,
    next,
    prev,
    close,
    startChained,
    reportMissingTarget,
    reportStepShown,
  } = useTours()

  const router = useRouter()
  const pathname = usePathname()
  const runPrepare = useTourPrepare()

  const needsNavigation = Boolean(
    activeStep?.route && normalizePath(activeStep.route) !== normalizePath(pathname || "/")
  )

  useEffect(() => {
    if (needsNavigation && activeStep?.route) router.push(activeStep.route)
  }, [needsNavigation, activeStep?.route, router])

  const resolveTarget = useCallback(() => {
    if (!activeStep) return null
    const [first] = stepTargets(activeStep)
    return first ? queryVisibleAnchor(first) : null
  }, [activeStep])

  const modal = useModalContext(Boolean(activeStep), resolveTarget)

  const stepKey = `${activeTour?.id ?? ""}:${stepIndex}`

  // Recordamos si ESTE paso llegó cambiando de pantalla. La ruta tiene que
  // navegar, resolver datos y montar, así que su ancla merece más paciencia que
  // una que ya está en el DOM.
  const navigatedForStep = useRef<string | null>(null)
  if (needsNavigation && navigatedForStep.current !== stepKey) {
    navigatedForStep.current = stepKey
  }

  const { rect, phase } = useStepTarget({
    step: activeStep,
    stepKey,
    active: Boolean(activeStep) && !needsNavigation,
    navigated: navigatedForStep.current === stepKey,
    runPrepare,
  })

  // El ancla nunca apareció: salteamos el paso salvo que pida caer al centro.
  //
  // El guard por stepKey NO es decorativo. `reportMissingTarget` cambia de
  // identidad en cada setActive, así que sin él este efecto se vuelve a
  // ejecutar en el mismo commit con el `phase === "missing"` viejo y encadena
  // un salteo tras otro: la guía se va del paso 2 al último de golpe y, al
  // pasar por un paso con `route`, dispara una navegación en el camino.
  const skippedStepRef = useRef<string | null>(null)
  // Cuántos se saltearon al hilo. Se pone en cero apenas un paso se dibuja,
  // así una guía con condicionales salteados de a uno nunca acumula.
  const consecutiveSkipsRef = useRef(0)

  useEffect(() => {
    if (phase === "ready" || phase === "centered") {
      consecutiveSkipsRef.current = 0
      reportStepShown()
    }
  }, [phase, stepKey, reportStepShown])

  useEffect(() => {
    if (!activeTour) {
      skippedStepRef.current = null
      consecutiveSkipsRef.current = 0
    }
  }, [activeTour])

  useEffect(() => {
    if (phase !== "missing") return
    if (skippedStepRef.current === stepKey) return
    if (
      !shouldSkipMissingStep({
        onMissing: activeStep?.onMissing,
        consecutiveSkips: consecutiveSkipsRef.current,
      })
    ) {
      return
    }
    skippedStepRef.current = stepKey
    consecutiveSkipsRef.current += 1
    reportMissingTarget()
  }, [phase, stepKey, activeTour, activeStep?.onMissing, reportMissingTarget])

  useEffect(() => {
    if (!activeStep) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null

      // Con el foco dentro de un diálogo de la app, el teclado es del
      // formulario y no de la guía. Un SelectTrigger de Radix es un <button>:
      // sin este corte, Enter abría el select Y avanzaba el paso, y Escape
      // cerraba la guía en vez de cerrar el desplegable.
      //
      // El :not() no es opcional: la tarjeta de la guía también es
      // role="dialog" y se auto-enfoca en cada paso, así que sin excluirla el
      // corte se aplicaba siempre y las flechas dejaban de funcionar en todos
      // lados.
      if (target?.closest('[role="dialog"]:not([data-tour-card])')) return

      // No robarle las flechas a la tabla de operaciones ni al kanban.
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        close()
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault()
        next()
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        prev()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeStep, next, prev, close])

  if (!activeTour || !activeStep) return null

  // Nada se muestra hasta tener qué mostrar. Atenuar mientras se navega o se
  // busca el ancla dejaría la pantalla apagada, sin tarjeta y sin salida —
  // parece que la app se colgó, sobre todo si la pantalla tarda en cargar.
  const showCard = phase === "ready" || phase === "centered" || phase === "missing"
  const anchored = phase === "ready"

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Paso ${stepIndex + 1} de ${visibleSteps.length}: ${activeStep.title}`}
      </div>

      {/* Con un modal abierto hay dos casos: si lo iluminado está adentro, el
          spotlight se muestra por encima del overlay de Radix; si está afuera,
          el diálogo lo tapa y no hay nada que mostrar. */}
      {showCard && (!modal.open || modal.targetInside) && (
        <TourSpotlight
          rect={anchored ? rect : null}
          interactive={activeStep.interactive === true}
          insideDialog={modal.targetInside}
        />
      )}

      {showCard && (
        <TourCard
          step={activeStep}
          stepIndex={stepIndex}
          totalSteps={visibleSteps.length}
          tourTitle={activeTour.title}
          rect={anchored ? rect : null}
          onChain={startChained}
          onNext={next}
          onPrev={prev}
          onClose={close}
        />
      )}
    </>
  )
}
