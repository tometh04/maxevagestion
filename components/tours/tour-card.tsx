"use client"

// La tarjeta que explica el paso.
//
// Anclada: Radix Popover contra un rect virtual, para heredar gratis el flip y
// el shift por colisión con el borde de la pantalla. Sin ancla (pasos de
// intro/cierre): la misma tarjeta centrada.

import { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import type { TourStep } from "@/lib/tours/types"
import { resolvePlacement } from "@/lib/tours/placement"
import type { TourRect } from "./use-target-rect"

interface TourCardProps {
  step: TourStep
  stepIndex: number
  totalSteps: number
  tourTitle: string
  rect: TourRect | null
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  /** Arranca la guía que este paso ofrece encadenar. */
  onChain: () => void
}

/** Sin ancla, o con un ancla que no deja lugar en ningún lado. */
function CenteredCard(props: TourCardProps) {
  return (
    // El contenedor NO puede comerse los clicks: ocupa la pantalla entera y en
    // un paso interactivo dejaría el formulario inutilizable. Solo la tarjeta
    // recibe puntero.
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div
        className="pointer-events-auto max-h-[calc(100vh-32px)] w-full max-w-[400px] overflow-y-auto rounded-2xl border border-border/50 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <TourCardBody {...props} />
      </div>
    </div>
  )
}

export function TourCard(props: TourCardProps) {
  const { step, rect } = props

  if (!rect) return <CenteredCard {...props} />

  const { side, align } = resolvePlacement({
    preferred: step.placement ?? "bottom",
    align: step.align ?? "center",
    rect,
    viewport: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
  })

  // La tarjeta no entra en ninguno de los cuatro lados: se centra en vez de
  // quedar cortada. El spotlight sigue marcando el campo.
  if (side === "center") return <CenteredCard {...props} />

  return (
    <Popover open modal={false}>
      <PopoverAnchor asChild>
        <div
          aria-hidden
          className="pointer-events-none fixed"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      </PopoverAnchor>
      <PopoverContent
        dismissableLayerBranch
        side={side}
        align={align}
        sideOffset={14}
        collisionPadding={16}
        className="z-[100] w-[360px] max-w-[calc(100vw-32px)] border-border/50 bg-card p-0 shadow-2xl"
        // Si un Dialog de Radix se abre durante un paso interactivo, pone
        // pointer-events:none en el body y la tarjeta queda inclickeable.
        style={{ pointerEvents: "auto" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        // El DismissableLayer de Radix marca el Escape como manejado antes de
        // que llegue al listener de window, así que la guía lo cierra acá.
        //
        // Pero este handler se dispara con CUALQUIER Escape del documento, no
        // solo con el foco en la tarjeta. Si el usuario está dentro de un
        // formulario cerrando un desplegable, ese Escape no es para la guía.
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          const focused = document.activeElement
          if (focused?.closest?.('[role="dialog"]:not([data-tour-card])')) return
          props.onClose()
        }}
      >
        <TourCardBody {...props} />
      </PopoverContent>
    </Popover>
  )
}

function TourCardBody({
  step,
  stepIndex,
  totalSteps,
  tourTitle,
  onNext,
  onPrev,
  onClose,
  onChain,
}: TourCardProps) {
  const titleId = useId()
  const bodyId = useId()
  const detailsId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Sin focus trap: los pasos interactivos piden clickear el elemento
  // iluminado, y atraparlo lo impediría. Solo se mueve el foco a la tarjeta
  // para que el lector de pantalla y el teclado arranquen ahí.
  //
  // El detalle se repliega en cada paso: si no, el siguiente aparecía ya
  // desplegado sin que nadie lo hubiera pedido.
  useEffect(() => {
    containerRef.current?.focus()
    setDetailsOpen(false)
  }, [stepIndex])

  const isLast = stepIndex === totalSteps - 1
  const isWarning = step.tone === "warning"
  const details = step.details ?? []
  const chains = Boolean(step.nextTour)

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      // La tarjeta también es role="dialog", así que el overlay necesita poder
      // distinguirla de un diálogo de la app para decidir de quién es el teclado.
      data-tour-card=""
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="outline-none"
    >
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`truncate text-[11px] font-semibold uppercase tracking-widest ${
              isWarning ? "text-accent-coral" : "text-primary"
            }`}
          >
            {isWarning ? "Cuidado" : tourTitle} · {stepIndex + 1}/{totalSteps}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar la guía"
            className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2.5 flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < stepIndex
                  ? "bg-primary/40"
                  : i === stepIndex
                    ? isWarning
                      ? "bg-accent-coral"
                      : "bg-primary"
                    : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="px-5 py-4">
        <h3 id={titleId} className="flex items-start gap-2 text-[15px] font-semibold leading-snug">
          {isWarning && (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-coral" aria-hidden />
          )}
          <span>{step.title}</span>
        </h3>
        {/* aria-describedby apunta solo acá: si el detalle plegado entrara,
            el lector de pantalla leería todo de una y se perdería la jerarquía
            entre "qué es esto" y "qué tenés que tener en cuenta". */}
        <p id={bodyId} className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {step.body}
        </p>

        {details.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              className="mt-2.5 flex items-center gap-1 rounded text-[12px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              {detailsOpen ? "Ver menos" : "Ver más"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${
                  detailsOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {detailsOpen && (
              // La tarjeta mide 360px: sin techo de alto, un paso con mucho
              // detalle empuja los botones fuera de la pantalla.
              <div
                id={detailsId}
                className="mt-2.5 max-h-[40vh] space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3 text-[12.5px] leading-relaxed text-muted-foreground"
              >
                {details.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* La guía encadenada se OFRECE, no se impone: quien solo quería el
          recorrido de la pantalla sigue con Siguiente y no queda arrastrado a
          un formulario de dieciocho pasos. */}
      {chains && (
        <div className="px-5 pb-1">
          <Button variant="outline" size="sm" className="w-full" onClick={onChain}>
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Guiarme para cargar una
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/50 px-5 py-3.5">
        <Button variant="ghost" size="sm" onClick={onPrev} disabled={stepIndex === 0}>
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Atrás
        </Button>
        <Button size="sm" onClick={onNext}>
          {isLast ? "Entendido" : "Siguiente"}
          {!isLast && <ChevronRight className="ml-1 h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}
