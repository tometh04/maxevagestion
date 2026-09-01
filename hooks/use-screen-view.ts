"use client"

import { useEffect } from "react"
import { trackViewOpened } from "@/lib/analytics/view-tracking"

/**
 * Registra la apertura de un dialog que funciona como pantalla.
 *
 * Los tabs se instrumentan solos desde `components/ui/tabs.tsx`. Los dialogs no
 * tienen un identificador propio equivalente al `value` de un tab, y además hay
 * decenas de dialogs chicos (confirmaciones, selectores) que no son pantallas.
 * Por eso acá el opt-in es explícito y de una línea.
 *
 * El caso que justifica todo esto es el builder de cotizaciones: son 2.300
 * líneas que viven DOS modales por debajo de `/sales/leads`, así que hasta ahora
 * cotizar se contabilizaba como uso del CRM. Con esto, el embudo "abrí el lead →
 * cotizé" se lee directo del stream.
 *
 * @example
 * useScreenView("quotation-builder", open)
 */
export function useScreenView(view: string, open: boolean = true): void {
  useEffect(() => {
    if (open) trackViewOpened("dialog", view)
  }, [view, open])
}
