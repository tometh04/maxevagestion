"use client"

// Checklist de configuración inicial en el dashboard.
//
// Es el recordatorio persistente del tour `setup-cuenta`: muestra el progreso
// org-scoped y cada fila reabre la guía en ese paso. El estado sale del
// ToursProvider, así que no vuelve a pedir datos ni duplica lógica.

import { Check, ChevronRight, Rocket, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useTours } from "@/components/tours/tours-provider"
import { getTourById } from "@/lib/tours/registry"

const SETUP_TOUR_ID = "setup-cuenta"

export function OnboardingChecklist() {
  const { orgSetup, canRunSetup, start, hideSetupChecklist, activeTour } = useTours()

  const tour = getTourById(SETUP_TOUR_ID)
  if (!tour || !canRunSetup) return null
  if (orgSetup.hidden) return null
  if (activeTour?.id === SETUP_TOUR_ID) return null

  // Solo los pasos accionables cuentan para el progreso: el de bienvenida no
  // es una tarea que la agencia tenga que hacer.
  const actionable = tour.steps.filter((s) => s.completesSetupKey)
  const completedCount = actionable.filter(
    (s) => s.completesSetupKey && orgSetup.completedSteps.includes(s.completesSetupKey)
  ).length

  if (completedCount >= actionable.length) return null

  const pct = Math.round((completedCount / actionable.length) * 100)

  return (
    <Card className="mb-6 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-primary" />
            Configurá tu agencia
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {completedCount} de {actionable.length} completos
            </span>
            <button
              onClick={hideSetupChecklist}
              title="No volver a mostrar"
              aria-label="Descartar configuración"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <Progress value={pct} className="mt-2 h-1" />
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        {actionable.map((step) => {
          const done = orgSetup.completedSteps.includes(step.completesSetupKey!)
          // El índice es el del tour completo, no el de la lista accionable:
          // start() navega por los pasos reales.
          const tourIndex = tour.steps.indexOf(step)
          return (
            <button
              key={step.id}
              onClick={() => {
                if (!done) start(SETUP_TOUR_ID, tourIndex)
              }}
              disabled={done}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                done ? "opacity-50" : "hover:bg-muted"
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  done ? "border-success bg-success text-success-foreground" : "border-border"
                }`}
              >
                {done && <Check className="h-3 w-3" />}
              </div>
              <span className="flex-1 font-medium">{step.title}</span>
              {!done && (
                <span className="text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Configurar <ChevronRight className="ml-0.5 inline h-3 w-3" />
                </span>
              )}
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
