"use client"

import { useEffect, useState } from "react"
import { useTours } from "@/components/tours/tours-provider"

const DISCOVERY_TOUR_ID = "crm-emilia-discovery"
const DISCOVERY_DELAY_MS = 800

/**
 * Presenta la novedad solo a quienes ya traían progreso en la guía general del
 * CRM. La elegibilidad se captura al montar: un usuario nuevo no
 * recibe esta segunda tarjeta cuando termina el recorrido completo.
 */
export function EmiliaCrmDiscovery() {
  const { activeTour, availableTours, isUnseen, start, toursDisabled } = useTours()
  const crmStatus = availableTours.find(({ tour }) => tour.id === "crm-kanban")?.status
  const discoveryIsAvailable = availableTours.some(
    ({ tour }) => tour.id === DISCOVERY_TOUR_ID
  )
  // Cualquier estado persistido significa que esta persona ya tuvo contacto
  // con el recorrido general. Le mostramos solo la novedad, incluso si dejó el
  // recorrido anterior a medias, sin obligarla a repetirlo.
  const [eligibleOnEntry] = useState(() => typeof crmStatus === "string")

  useEffect(() => {
    if (
      !eligibleOnEntry ||
      toursDisabled ||
      activeTour ||
      !discoveryIsAvailable ||
      !isUnseen(DISCOVERY_TOUR_ID)
    ) {
      return
    }

    const timer = window.setTimeout(() => start(DISCOVERY_TOUR_ID), DISCOVERY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [
    activeTour,
    discoveryIsAvailable,
    eligibleOnEntry,
    isUnseen,
    start,
    toursDisabled,
  ])

  return null
}
