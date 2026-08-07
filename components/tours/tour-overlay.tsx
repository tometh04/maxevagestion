"use client"

// Se monta una sola vez en el layout del dashboard. Junta las tres piezas:
// navegación entre pasos cross-route, resolución del ancla y render del
// atenuado + la tarjeta.

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { normalizePath } from "@/lib/tours/registry"
import { useTours } from "./tours-provider"
import { useTourPrepare } from "./use-tour-prepare"
import { useStepTarget } from "./use-target-rect"
import { useModalOpen } from "./use-modal-open"
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

  const modalOpen = useModalOpen(Boolean(activeStep))

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

  useEffect(() => {
    if (phase === "ready" || phase === "centered") reportStepShown()
  }, [phase, stepKey, reportStepShown])

  // El ancla nunca apareció: salteamos el paso salvo que pida caer al centro.
  //
  // El guard por stepKey NO es decorativo. `reportMissingTarget` cambia de
  // identidad en cada setActive, así que sin él este efecto se vuelve a
  // ejecutar en el mismo commit con el `phase === "missing"` viejo y encadena
  // un salteo tras otro: la guía se va del paso 2 al último de golpe y, al
  // pasar por un paso con `route`, dispara una navegación en el camino.
  const skippedStepRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeTour) skippedStepRef.current = null
  }, [activeTour])

  useEffect(() => {
    if (phase !== "missing") return
    if (activeStep?.onMissing === "center") return
    if (skippedStepRef.current === stepKey) return
    skippedStepRef.current = stepKey
    reportMissingTarget()
  }, [phase, stepKey, activeTour, activeStep?.onMissing, reportMissingTarget])

  useEffect(() => {
    if (!activeStep) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      // No robarle las flechas a la tabla de operaciones ni al kanban.
      const target = event.target as HTMLElement | null
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

      {/* Con un modal abierto el atenuado sobra (el overlay del dialog ya
          cumple esa función) y los blockers estorbarían. */}
      {showCard && !modalOpen && (
        <TourSpotlight rect={anchored ? rect : null} interactive={activeStep.interactive === true} />
      )}

      {showCard && (
        <TourCard
          step={activeStep}
          stepIndex={stepIndex}
          totalSteps={visibleSteps.length}
          tourTitle={activeTour.title}
          rect={anchored ? rect : null}
          onNext={next}
          onPrev={prev}
          onClose={close}
        />
      )}
    </>
  )
}
