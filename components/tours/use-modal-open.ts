"use client"

// Detecta si hay un modal de Radix abierto (Dialog, AlertDialog, Sheet).
//
// Importa porque los pasos `interactive` le piden al usuario que abra algo:
// "usá el botón Nueva Cuenta". Cuando ese Dialog se abre, Radix pone
// pointer-events:none en <body> y monta su overlay en z-50. Nuestros blockers
// viven en z-[91], o sea que quedarían POR ENCIMA del dialog y el usuario no
// podría completar la acción que la guía acaba de pedirle.
//
// Con un modal abierto apagamos el atenuado y los blockers, y dejamos solo la
// tarjeta (con pointer-events propios) para que se pueda seguir avanzando.

import { useEffect, useState } from "react"

function bodyIsLocked(): boolean {
  if (typeof document === "undefined") return false
  return document.body.style.pointerEvents === "none"
}

export function useModalOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setOpen(false)
      return
    }

    setOpen(bodyIsLocked())
    const observer = new MutationObserver(() => setOpen(bodyIsLocked()))
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] })
    return () => observer.disconnect()
  }, [enabled])

  return open
}
