"use client"

// Emision de vistas sin URL propia (tabs y dialogs).
//
// Vive aparte del dispatcher para que los dos emisores — el wrapper de `Tabs` y
// el hook `useScreenView` — compartan exactamente la misma resolucion de modulo
// y la misma ventana de dedupe. Si cada uno hiciera lo suyo, un tab y un dialog
// con el mismo nombre se contarian distinto.

import { moduleFromPath } from "./modules"
import { screenForView, screenFromPath, shouldEmitScreen } from "./screens"
import { trackEvent } from "./track"

/**
 * Emite `view_opened` si corresponde. No-op fuera del browser, en rutas que no
 * son uso de tenant, o si la misma vista ya se emitio hace menos de 2 s.
 *
 * El dedupe importa mas de lo que parece: los tabs anidados remontan cuando
 * cambia el tab exterior, y el wrapper emite en mount para poder ver los
 * `defaultValue`. Sin ventana, un click del usuario cuenta dos o tres veces.
 */
export function trackViewOpened(kind: "tab" | "dialog", view: string): void {
  if (typeof window === "undefined") return

  const pathname = window.location.pathname
  const productModule = moduleFromPath(pathname)
  if (!productModule) return

  const key = screenForView(screenFromPath(pathname), kind === "tab" ? "tab" : "dlg", view)
  if (!key) return
  if (!shouldEmitScreen(key, Date.now())) return

  trackEvent("view_opened", { module: productModule, view_kind: kind, view })
}
