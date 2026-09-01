"use client"

// Identidad de SESION del browser.
//
// Sin esto, `usage_events` es una nube de eventos sueltos: se puede contar
// cuantas pantallas se abrieron, pero no cuantas veces alguien se sento a
// trabajar ni cuanto duro cada vez. Agrupar por usuario y dia no alcanza — una
// persona que entra tres veces en el dia son tres sesiones, no una.
//
// No tiene nada que ver con la sesion de auth. Esta muere al cerrar la pestaña;
// la de auth dura 12 h de inactividad. A proposito: lo que se quiere medir es
// "una sentada de trabajo", no "un login".

const STORAGE_KEY = "vibook.usage.sid"

let cached: string | null = null

/**
 * `sessionStorage` y no `localStorage`: es por pestaña y muere al cerrarla, que
 * es exactamente la semantica que se quiere. Con `localStorage` dos pestañas
 * abiertas en paralelo compartirian id y la duracion de sesion mediria el lapso
 * entre la primera y la ultima, no el trabajo real.
 */
export function getUsageSessionId(): string | null {
  if (typeof window === "undefined") return null
  if (cached) return cached

  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY)
    if (existing) {
      cached = existing
      return cached
    }

    const fresh = createId()
    window.sessionStorage.setItem(STORAGE_KEY, fresh)
    cached = fresh
    return cached
  } catch {
    // `sessionStorage` puede tirar en modo privado de Safari o con cookies de
    // terceros bloqueadas. Se degrada a un id en memoria: se pierde al navegar
    // con recarga dura, pero la telemetria no puede romper la app por esto.
    if (!cached) cached = createId()
    return cached
  }
}

function createId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
  } catch {
    // sigue al fallback
  }
  // Fallback para browsers viejos y para contextos no seguros (http en LAN),
  // donde `crypto.randomUUID` no existe. La columna es UUID: si esto no tuviera
  // forma de UUID, el insert del batch entero fallaria.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Solo para tests. */
export function __resetUsageSessionId(): void {
  cached = null
}
