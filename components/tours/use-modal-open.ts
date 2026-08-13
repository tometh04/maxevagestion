"use client"

// Cómo se comporta la guía cuando hay un modal de Radix abierto.
//
// Hay dos situaciones opuestas y hasta ahora las tratábamos igual:
//
//  1. El paso ilumina algo QUE ESTÁ DENTRO del diálogo (la guía de carga de una
//     operación explica campo por campo). Ahí el spotlight tiene que verse, y
//     por encima del overlay de Radix.
//  2. El paso ilumina algo de la pantalla de atrás y el diálogo lo tapa. Ahí no
//     hay nada que mostrar: se esconde.
//
// Sobre los blockers: resultaron ser inertes con un modal abierto. Radix pone
// pointer-events:none en <body> y nuestros divs no lo sobrescriben, así que no
// roban clicks aunque vivan en z-[91]. Lo que sí molestaba era el atenuado
// pintando encima del diálogo. Con el target adentro no hace falta ninguno de
// los dos: el overlay de Radix y su disableOutsidePointerEvents ya bloquean todo
// lo de afuera.

import { useEffect, useState } from "react"

export interface ModalContext {
  /** Hay algún layer modal abierto (Dialog, AlertDialog, Sheet, menú modal). */
  open: boolean
  /** El ancla del paso actual vive dentro de ese layer. */
  targetInside: boolean
}

function bodyIsLocked(): boolean {
  if (typeof document === "undefined") return false
  return document.body.style.pointerEvents === "none"
}

/**
 * `resolveTarget` devuelve el elemento iluminado en este momento (o null).
 * Se pasa como función y no como elemento para poder reevaluarlo cuando el
 * diálogo monta o desmonta, sin re-suscribir el observer.
 */
export function useModalContext(
  enabled: boolean,
  resolveTarget: () => HTMLElement | null
): ModalContext {
  const [ctx, setCtx] = useState<ModalContext>({ open: false, targetInside: false })

  useEffect(() => {
    if (!enabled) {
      setCtx({ open: false, targetInside: false })
      return
    }

    const read = () => {
      const open = bodyIsLocked()
      const targetInside = open ? Boolean(resolveTarget()?.closest('[role="dialog"]')) : false
      setCtx((prev) =>
        prev.open === open && prev.targetInside === targetInside ? prev : { open, targetInside }
      )
    }

    read()

    // El style del body marca la apertura/cierre del modal; el subtree capta el
    // montaje del portal, que es cuando el ancla del paso recién existe.
    const observer = new MutationObserver(read)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resolveTarget])

  return ctx
}
