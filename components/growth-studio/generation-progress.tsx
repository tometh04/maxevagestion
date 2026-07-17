"use client"

import * as React from "react"
import { ImageIcon, Route, Send, type LucideIcon } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export type GrowthGenerationKind = "image" | "concepts" | "channels"

type GenerationProgressConfig = {
  title: string
  icon: LucideIcon
  steps: readonly string[]
}

export const generationProgressConfig: Record<
  GrowthGenerationKind,
  GenerationProgressConfig
> = {
  image: {
    title: "Creando una imagen que invite a viajar",
    icon: ImageIcon,
    steps: [
      "Trazando el destino ideal",
      "Buscando una luz que despierte ganas de viajar",
      "Componiendo la escena y su atmósfera",
      "Ajustando color, profundidad y detalles",
      "Dejando el espacio justo para tu mensaje",
      "Preparando la imagen en la calidad elegida",
    ],
  },
  concepts: {
    title: "Diseñando tres rutas creativas",
    icon: Route,
    steps: [
      "Leyendo el objetivo de la campaña",
      "Reconociendo la voz de tu marca",
      "Explorando distintos caminos para contar el viaje",
      "Convirtiendo destinos en ideas memorables",
      "Afinando ganchos y llamados a la acción",
      "Preparando las tres variantes para elegir",
    ],
  },
  channels: {
    title: "Preparando el contenido de la campaña",
    icon: Send,
    steps: [
      "Tomando el concepto elegido como punto de partida",
      "Dándole forma al post de Instagram",
      "Pensando cada pantalla de Stories",
      "Ajustando el mensaje para WhatsApp",
      "Armando un email que acompañe la propuesta",
      "Revisando tono, extensión y llamados a la acción",
    ],
  },
}

const INITIAL_PROGRESS = 10
const MAX_PENDING_PROGRESS = 92
const STEP_DURATION_MS = 4_000
const PROGRESS_TIME_CONSTANT_MS = 12_000

export function estimatedGenerationProgress(elapsedMs: number): number {
  const safeElapsed = Math.max(0, elapsedMs)
  const easedProgress =
    INITIAL_PROGRESS +
    (MAX_PENDING_PROGRESS - INITIAL_PROGRESS) *
      (1 - Math.exp(-safeElapsed / PROGRESS_TIME_CONSTANT_MS))

  return Math.min(MAX_PENDING_PROGRESS, Math.round(easedProgress))
}

export function generationStepIndex(
  elapsedMs: number,
  stepCount: number
): number {
  if (stepCount <= 1) return 0
  return Math.min(
    stepCount - 1,
    Math.floor(Math.max(0, elapsedMs) / STEP_DURATION_MS)
  )
}

export function GenerationProgress({
  kind,
  className,
}: {
  kind: GrowthGenerationKind
  className?: string
}) {
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const startedAt = React.useRef(Date.now())
  const config = generationProgressConfig[kind]
  const Icon = config.icon

  React.useEffect(() => {
    startedAt.current = Date.now()
    setElapsedMs(0)

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current)
    }, 750)

    return () => window.clearInterval(interval)
  }, [kind])

  const progress = estimatedGenerationProgress(elapsedMs)
  const step = config.steps[generationStepIndex(elapsedMs, config.steps.length)]

  return (
    <div
      className={cn("rounded-xl bg-primary/5 px-4 py-4 sm:px-5", className)}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-foreground">{config.title}</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              Avance estimado {progress}%
            </span>
          </div>
          <p
            className="mt-1 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {step}…
          </p>
          <Progress
            value={progress}
            aria-label={config.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={`${step}. Avance estimado ${progress}%`}
            className="mt-3 h-1.5 motion-reduce:[&>div]:transition-none"
          />
        </div>
      </div>
    </div>
  )
}
