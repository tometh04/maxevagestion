"use client"

// Las mismas preferencias del menú "Guías", espejadas en Configuración porque
// es donde la gente va a buscar ajustes. Comparten estado vía ToursProvider,
// así que no hay dos fuentes de verdad.

import { Compass, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useTours } from "./tours-provider"

export function ToursPreferences() {
  const { toursDisabled, setToursDisabled, resetAll } = useTours()

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-teal/10">
          <Compass className="h-3.5 w-3.5 text-accent-teal" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
          Guías de la app
        </span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Mostrar guías automáticamente</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            La primera vez que entrás a una pantalla, te explicamos paso a paso qué es cada cosa.
          </p>
        </div>
        <Switch
          checked={!toursDisabled}
          onCheckedChange={(checked) => setToursDisabled(!checked)}
          aria-label="Mostrar guías automáticamente"
        />
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Reiniciar todas las guías</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Volvés a verlas desde cero. Solo afecta a tu usuario.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Reiniciar
        </Button>
      </div>
    </div>
  )
}
