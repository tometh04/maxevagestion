"use client"

// El atenuado con recorte.
//
// El hueco lo dibuja una sombra de 9999px sobre un div del tamaño del elemento:
// así el recorte hereda el border-radius real y anima solo con transition-all
// entre pasos. Esa técnica es transparente a los pointer events a propósito —
// quién puede clickear qué lo deciden los blockers, que es una decisión
// explícita y no un efecto secundario de cómo se pinta.

import type { TourRect } from "./use-target-rect"

const DIM = "hsl(var(--foreground) / 0.55)"

export function TourSpotlight({
  rect,
  interactive,
  insideDialog = false,
}: {
  rect: TourRect | null
  interactive: boolean
  /**
   * El elemento iluminado vive dentro de un diálogo modal. Cambia dos cosas:
   * el atenuado sube por encima del overlay de Radix (z-50), y no se dibujan
   * los blockers — el propio diálogo ya bloquea todo lo de afuera.
   */
  insideDialog?: boolean
}) {
  // z-[95] queda sobre el overlay del diálogo (z-50) y debajo de la tarjeta
  // (z-[100]), que es el orden que hace falta.
  const dimLayer = insideDialog ? "z-[95]" : "z-[90]"
  const ringLayer = insideDialog ? "z-[96]" : "z-[92]"

  if (!rect) {
    return (
      <div
        aria-hidden
        className={`fixed inset-0 ${dimLayer} animate-in fade-in duration-200`}
        style={{ background: DIM }}
      />
    )
  }

  const { top, left, width, height, radius } = rect
  const box = { top, left, width, height, borderRadius: radius } as const

  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none fixed ${dimLayer} transition-all duration-200 ease-out motion-reduce:transition-none`}
        style={{ ...box, boxShadow: `0 0 0 9999px ${DIM}` }}
      />
      <div
        aria-hidden
        className={`pointer-events-none fixed ${ringLayer} animate-tour-pulse ring-1 ring-primary/60 transition-all duration-200 ease-out motion-reduce:animate-none motion-reduce:transition-none`}
        style={box}
      />
      {!insideDialog && <SpotlightBlockers rect={rect} interactive={interactive} />}
    </>
  )
}

/**
 * Cuatro rects transparentes que se comen los clicks alrededor del hueco. El
 * quinto tapa el hueco cuando el paso no pide interactuar con el elemento.
 */
function SpotlightBlockers({ rect, interactive }: { rect: TourRect; interactive: boolean }) {
  const top = Math.max(0, rect.top)
  const bottom = rect.top + rect.height
  const left = Math.max(0, rect.left)
  const right = rect.left + rect.width
  const bandHeight = Math.max(0, bottom - top)

  return (
    <>
      <div aria-hidden className="fixed z-[91]" style={{ top: 0, left: 0, right: 0, height: top }} />
      <div aria-hidden className="fixed z-[91]" style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div aria-hidden className="fixed z-[91]" style={{ top, left: 0, width: left, height: bandHeight }} />
      <div aria-hidden className="fixed z-[91]" style={{ top, left: right, right: 0, height: bandHeight }} />
      {!interactive && (
        <div
          aria-hidden
          className="fixed z-[91]"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
    </>
  )
}
