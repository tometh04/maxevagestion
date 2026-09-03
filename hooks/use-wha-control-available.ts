"use client"

import { useEffect, useState } from "react"

/**
 * ¿El usuario puede usar WHA Control? (rol permitido + al menos un device
 * cargado en la org). Se usa para decidir si el teléfono de un lead linkea
 * al chat de WHA Control.
 *
 * El resultado se cachea a nivel módulo: un solo fetch por sesión de página,
 * aunque el hook se monte en muchos diálogos.
 */

let cachedPromise: Promise<boolean> | null = null

function checkAvailability(): Promise<boolean> {
  if (!cachedPromise) {
    cachedPromise = fetch("/api/wha-control/devices")
      .then(async (res) => {
        if (!res.ok) return false // 403 para roles sin acceso
        const data = await res.json().catch(() => ({}))
        return (data.devices?.length ?? 0) > 0
      })
      .catch(() => false)
  }
  return cachedPromise
}

export function useWhaControlAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    checkAvailability().then((ok) => {
      if (!cancelled) setAvailable(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return available
}
