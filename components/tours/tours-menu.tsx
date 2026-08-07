"use client"

// Punto de reentrada a las guías: cerrar una guía nunca la pierde.
//
// Vive al lado de la campana de novedades a propósito, para que el cluster de
// la derecha del header se lea como "ayuda y novedades".

import { useState } from "react"
import { Check, Compass, RotateCcw, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { tourLaunchPath } from "@/lib/tours/entry"
import { useTours } from "./tours-provider"

export function ToursMenu() {
  const {
    tourForCurrentPath,
    availableTours,
    toursDisabled,
    setToursDisabled,
    resetAll,
    start,
    entryStepFor,
    isUnseen,
    activeTour,
  } = useTours()

  const [open, setOpen] = useState(false)

  if (availableTours.length === 0) return null

  // Se enciende solo cuando la pantalla en la que estás tiene una guía que
  // todavía no recorriste. Prenderlo mientras quede alguna sin ver en cualquier
  // lado lo dejaría encendido durante días y la gente aprendería a ignorarlo.
  const hasUnseenHere =
    Boolean(tourForCurrentPath) && isUnseen(tourForCurrentPath!.id) && !activeTour

  // Solo con el menú abierto: lee el DOM para saber qué tab está activo.
  const entryStepLabel =
    open && tourForCurrentPath ? entryStepFor(tourForCurrentPath.id).title : null

  /** Desde cero. Se usa en la lista completa: elegir una guía la reinicia. */
  const launch = (tourId: string) => {
    setOpen(false)
    start(tourId, 0)
  }

  /** Entra por el paso que corresponde a lo que hay en pantalla. */
  const resume = (tourId: string) => {
    const { index } = entryStepFor(tourId)
    setOpen(false)
    start(tourId, index)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            hasUnseenHere ? "Guías de la app — hay una guía para esta pantalla" : "Guías de la app"
          }
        >
          <Compass className="h-[18px] w-[18px]" />
          {/* Rojo y no el color de marca: es el código universal de "mirá acá",
              y encima el primario cambia por agencia (BrandProvider), así que
              con el color de marca el punto podía quedar invisible. */}
          {hasUnseenHere && (
            <span className="absolute right-1 top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border/50 px-4 py-3">
          <p className="text-sm font-semibold">Guías</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recorridos paso a paso por cada pantalla.
          </p>
        </div>

        {tourForCurrentPath && (
          <div className="border-b border-border/50 p-2">
            <button
              type="button"
              onClick={() => resume(tourForCurrentPath.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Play className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  Ver la guía de esta pantalla
                </span>
                {/* Se nombra el paso por el que va a entrar: la guía puede
                    arrancar en el medio si estás parado en un tab puntual, y
                    sin decirlo el salto sorprende. */}
                <span className="block truncate text-xs text-muted-foreground">
                  {entryStepLabel ?? tourForCurrentPath.title}
                </span>
              </span>
            </button>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto p-2">
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Todas las guías
          </p>
          {availableTours.map(({ tour, status }) => {
            // Se puede abrir desde acá si sabe a qué pantalla ir, o si ya
            // estamos parados en la suya.
            const canLaunch =
              Boolean(tourLaunchPath(tour)) || tourForCurrentPath?.id === tour.id

            return (
              <button
                key={tour.id}
                type="button"
                disabled={!canLaunch}
                title={canLaunch ? undefined : tour.launchHint}
                onClick={() => launch(tour.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  canLaunch ? "hover:bg-muted" : "cursor-default opacity-60"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                    status === "completed"
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {status === "completed" ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{tour.title}</span>
                  {!canLaunch && tour.launchHint && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {tour.launchHint}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="space-y-3 border-t border-border/50 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm">Mostrar guías automáticamente</span>
            <Switch
              checked={!toursDisabled}
              onCheckedChange={(checked) => setToursDisabled(!checked)}
              aria-label="Mostrar guías automáticamente"
            />
          </label>
          <Button variant="outline" size="sm" className="w-full" onClick={resetAll}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reiniciar todas las guías
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
