"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CalendarClock, Unlink, BookX } from "lucide-react"

/**
 * Lo que le falta a esta agencia para que su contabilidad signifique algo.
 *
 * Empezó avisando una sola cosa —desde cuándo se lleva la contabilidad acá— y
 * hoy avisa tres, porque las otras dos aparecieron en producción y ninguna se
 * veía:
 *
 * - **Sin plan de cuentas**: la agencia opera normal y no genera un solo
 *   asiento. Tres agencias arrancaron así por un hueco en el alta y estuvieron
 *   días sin que nadie lo notara.
 * - **Cuentas financieras sin vincular**: lo mismo pero parcial. VICO tiene
 *   nueve, y los movimientos de esas nueve nunca llegaron a la contabilidad.
 * - **Sin fecha de inicio**: no rompe nada, pero el Balance y el Estado de
 *   Resultados no se pueden emitir.
 *
 * Es un aviso, no un bloqueo: si algo no se puede leer, no se muestra nada. Un
 * cartel que aparece porque una consulta falló manda a arreglar algo que
 * funciona, y eso cuesta más confianza de la que aporta.
 */

/** Desde cuándo tiene sentido pedir la configuración inicial. */
const DESDE = "2026-09-01"

interface Aviso {
  clave: string
  Icono: typeof CalendarClock
  titulo: string
  detalle: string
  accion?: { label: string; href: string }
}

export function AccountingSetupBanner() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [grave, setGrave] = useState(false)

  useEffect(() => {
    let cancelado = false

    ;(async () => {
      const pendientes: Aviso[] = []
      let esGrave = false

      try {
        const res = await fetch("/api/accounting/setup-status")
        if (res.ok) {
          const s = await res.json()

          if (s.sinPlanDeCuentas) {
            // Cuando falta el plan, el resto es consecuencia: sin cuentas
            // contables no hay nada que vincular ni nada que valuar. Se avisa
            // esto solo, para no repartir la atención entre tres carteles que
            // en realidad son un problema.
            esGrave = true
            pendientes.push({
              clave: "plan",
              Icono: BookX,
              titulo: "Esta agencia no tiene plan de cuentas",
              detalle:
                "Ningún movimiento está generando asiento: la operación sigue normal y la contabilidad queda vacía. Es un problema nuestro, no de configuración. Avisanos desde Ayuda y lo cargamos.",
              accion: { label: "Ayuda", href: "/ayuda" },
            })
          } else if (s.cuentasSinMapear > 0) {
            const n = s.cuentasSinMapear
            pendientes.push({
              clave: "mapeo",
              Icono: Unlink,
              titulo:
                n === 1
                  ? "Hay una cuenta sin vincular al plan"
                  : `Hay ${n} cuentas sin vincular al plan`,
              detalle:
                "Los movimientos de esas cuentas no generan asiento, así que no aparecen en el Balance ni en el Mayor. Elegí a qué cuenta del plan corresponde cada una.",
              accion: { label: "Vincular", href: "/accounting/financial-accounts" },
            })
          }
        }
      } catch {
        // Sin diagnóstico no hay aviso.
      }

      // La fecha de inicio no es un defecto sino una definición de la agencia,
      // así que no se pide antes de que arranque el período.
      if (!esGrave && new Date().toISOString().slice(0, 10) >= DESDE) {
        try {
          const res = await fetch("/api/finances/settings")
          if (res.ok) {
            const json = await res.json()
            const settings = json?.data ?? json?.settings ?? json
            if (settings && !settings.accounting_start_date) {
              pendientes.push({
                clave: "fecha",
                Icono: CalendarClock,
                titulo: "Falta configurar la contabilidad de la agencia",
                detalle:
                  "Para emitir el Balance y el Estado de Resultados hay que definir desde qué fecha se lleva la contabilidad acá, y a qué cotización se valúa lo que está en otra moneda. Podés tomar el dólar oficial automáticamente o cargarlo vos.",
                accion: { label: "Configurar", href: "/finances/settings" },
              })
            }
          }
        } catch {
          // Igual que arriba.
        }
      }

      if (!cancelado) {
        setAvisos(pendientes)
        setGrave(esGrave)
      }
    })()

    return () => {
      cancelado = true
    }
  }, [])

  if (avisos.length === 0) return null

  const tono = grave
    ? "border-destructive/40 bg-destructive/5"
    : "border-amber-500/30 bg-amber-500/10"
  const tonoIcono = grave ? "text-destructive" : "text-amber-600 dark:text-amber-400"

  return (
    <div className={`divide-y divide-border/60 rounded-md border ${tono}`}>
      {avisos.map(({ clave, Icono, titulo, detalle, accion }) => (
        <div key={clave} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
          <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${tonoIcono}`} aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">{titulo}</p>
            <p className="text-sm text-muted-foreground">{detalle}</p>
          </div>
          {accion && (
            <Button asChild size="sm" variant="outline">
              <Link href={accion.href}>{accion.label}</Link>
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
