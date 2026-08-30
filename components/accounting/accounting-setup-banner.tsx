"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CalendarClock } from "lucide-react"

/**
 * Aviso de que falta configurar la contabilidad de la agencia.
 *
 * A partir del 1/9/2026 las agencias empiezan a llevar su contabilidad en
 * vibook. Para que el Balance y el Estado de Resultados signifiquen algo hacen
 * falta dos definiciones que son de cada agencia y que nadie puede tomar por
 * ella: desde cuándo arranca, y a qué cotización valúa lo que está en otra
 * moneda.
 *
 * Se muestra solo si falta configurarlo. Una vez cargada la fecha, desaparece:
 * no es un cartel permanente.
 */

/** Desde cuándo tiene sentido pedirlo. Antes de esta fecha no molesta a nadie. */
const DESDE = "2026-09-01"

export function AccountingSetupBanner() {
  const [faltaConfigurar, setFaltaConfigurar] = useState(false)

  useEffect(() => {
    // Antes del arranque no hay nada que pedir.
    if (new Date().toISOString().slice(0, 10) < DESDE) return

    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch("/api/finances/settings")
        if (!res.ok) return
        const json = await res.json()
        const settings = json?.data ?? json?.settings ?? json
        if (!cancelado && settings && !settings.accounting_start_date) {
          setFaltaConfigurar(true)
        }
      } catch {
        // Si no se puede leer la configuración, no molestamos: el aviso es una
        // ayuda, no un bloqueo.
      }
    })()

    return () => {
      cancelado = true
    }
  }, [])

  if (!faltaConfigurar) return null

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">Falta configurar la contabilidad de la agencia</p>
        <p className="text-sm text-muted-foreground">
          Para poder emitir el Balance y el Estado de Resultados hay que definir dos cosas: desde
          qué fecha se lleva la contabilidad acá, y a qué cotización se valúa lo que está en otra
          moneda. Podés tomar el dólar oficial automáticamente o cargarlo vos.
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/finances/settings">Configurar</Link>
      </Button>
    </div>
  )
}
