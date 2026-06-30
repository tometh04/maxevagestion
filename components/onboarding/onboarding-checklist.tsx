"use client"

import { useRouter } from "next/navigation"
import { Check, ChevronRight, Rocket } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ONBOARDING_STEPS, useOnboarding } from "./use-onboarding"
import type { PersistedOnboardingState } from "@/lib/onboarding/steps"

export function OnboardingChecklist({
  enabled,
  initialState,
}: {
  enabled: boolean
  initialState?: PersistedOnboardingState | null
}) {
  const router = useRouter()
  const ob = useOnboarding(initialState)

  if (!enabled) return null
  if (!ob.mounted) return null
  if (ob.allDone && ob.dismissed) return null
  if (ob.tourActive) return null

  const pct = Math.round((ob.completedCount / ob.totalSteps) * 100)

  return (
    <Card className="mb-6 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-primary" />
            Configurá tu agencia
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {ob.completedCount} de {ob.totalSteps} completos
          </span>
        </div>
        <Progress value={pct} className="mt-2 h-1" />
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        {ONBOARDING_STEPS.map((step, i) => {
          const done = ob.isStepCompleted(step.key)
          return (
            <button
              key={step.key}
              onClick={() => {
                if (!done) {
                  ob.startTourAt(i)
                  router.push(step.route)
                }
              }}
              disabled={done}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                done
                  ? "opacity-50"
                  : "hover:bg-muted"
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  done
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-border"
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
