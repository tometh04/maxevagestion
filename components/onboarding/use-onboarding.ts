"use client"

import { useState, useCallback, useEffect } from "react"
import {
  ONBOARDING_STEPS,
  emptyOnboardingState,
  sanitizeOnboardingState,
  type OnboardingStep,
  type PersistedOnboardingState,
} from "@/lib/onboarding/steps"

// Re-export para compatibilidad con los imports existentes
// (`import { ONBOARDING_STEPS, useOnboarding } from "./use-onboarding"`).
export { ONBOARDING_STEPS }
export type { OnboardingStep }

interface OnboardingState {
  // Persistido en DB (users.onboarding_state):
  completedSteps: string[]
  dismissed: boolean
  completedAt: string | null
  // Transitorio (solo en memoria, no se persiste):
  tourActive: boolean
  tourStepIndex: number
}

function initialFrom(initial?: PersistedOnboardingState | null): OnboardingState {
  const s = initial ? sanitizeOnboardingState(initial) : emptyOnboardingState()
  return {
    completedSteps: s.completedSteps,
    dismissed: s.dismissed,
    completedAt: s.completedAt ?? null,
    tourActive: false,
    tourStepIndex: 0,
  }
}

// Persiste solo el subconjunto real de progreso. keepalive: true para que el
// request sobreviva si el tour navega a otra ruta inmediatamente después.
function persistState(state: OnboardingState) {
  const payload: PersistedOnboardingState = {
    completedSteps: state.completedSteps,
    dismissed: state.dismissed,
    completedAt: state.completedAt ?? null,
  }
  try {
    void fetch("/api/onboarding/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

export function useOnboarding(initial?: PersistedOnboardingState | null) {
  const [state, setState] = useState<OnboardingState>(() => initialFrom(initial))
  const [showWelcome, setShowWelcome] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Auto-mostrar el modal de bienvenida si todavía no se descartó ni se
    // completó. El estado inicial ya viene del server (props), no de localStorage.
    setState((prev) => {
      if (!prev.dismissed && prev.completedSteps.length < ONBOARDING_STEPS.length) {
        setShowWelcome(true)
      }
      return prev
    })
  }, [])

  const update = useCallback((partial: Partial<OnboardingState>, persist = false) => {
    setState((prev) => {
      const next = { ...prev, ...partial }
      if (persist) persistState(next)
      return next
    })
  }, [])

  const startTour = useCallback(() => {
    setShowWelcome(false)
    update({ tourActive: true, tourStepIndex: 0 })
  }, [update])

  const startTourAt = useCallback(
    (stepIndex: number) => {
      update({ tourActive: true, tourStepIndex: stepIndex })
    },
    [update]
  )

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false)
    update({ dismissed: true }, true)
  }, [update])

  const completeCurrentStep = useCallback(() => {
    setState((prev) => {
      const step = ONBOARDING_STEPS[prev.tourStepIndex]
      if (!step) return prev
      const completedSteps = prev.completedSteps.includes(step.key)
        ? prev.completedSteps
        : [...prev.completedSteps, step.key]
      const nextIndex = prev.tourStepIndex + 1
      const allDone = completedSteps.length >= ONBOARDING_STEPS.length
      const next: OnboardingState = {
        ...prev,
        completedSteps,
        completedAt: allDone ? prev.completedAt ?? new Date().toISOString() : prev.completedAt,
        tourStepIndex: allDone ? prev.tourStepIndex : nextIndex,
        tourActive: !allDone && nextIndex < ONBOARDING_STEPS.length,
      }
      persistState(next)
      if (allDone || nextIndex >= ONBOARDING_STEPS.length) {
        setShowCompletion(true)
      }
      return next
    })
  }, [])

  const skipStep = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.tourStepIndex + 1
      if (nextIndex >= ONBOARDING_STEPS.length) {
        if (prev.completedSteps.length >= ONBOARDING_STEPS.length) {
          setShowCompletion(true)
        }
        return { ...prev, tourActive: false }
      }
      return { ...prev, tourStepIndex: nextIndex }
    })
  }, [])

  const prevStep = useCallback(() => {
    setState((prev) => {
      if (prev.tourStepIndex <= 0) return prev
      return { ...prev, tourStepIndex: prev.tourStepIndex - 1 }
    })
  }, [])

  const closeTour = useCallback(() => {
    update({ tourActive: false, dismissed: true }, true)
  }, [update])

  const closeCompletion = useCallback(() => {
    setShowCompletion(false)
    update({ tourActive: false, dismissed: true }, true)
  }, [update])

  const completeStepByKey = useCallback((key: string) => {
    setState((prev) => {
      if (prev.completedSteps.includes(key)) return prev
      const completedSteps = [...prev.completedSteps, key]
      const allDone = completedSteps.length >= ONBOARDING_STEPS.length
      const next: OnboardingState = {
        ...prev,
        completedSteps,
        completedAt: allDone ? prev.completedAt ?? new Date().toISOString() : prev.completedAt,
      }
      persistState(next)
      return next
    })
  }, [])

  const resetOnboarding = useCallback(() => {
    const fresh: OnboardingState = {
      completedSteps: [],
      dismissed: false,
      completedAt: null,
      tourActive: false,
      tourStepIndex: 0,
    }
    persistState(fresh)
    setState(fresh)
    setShowWelcome(true)
    setShowCompletion(false)
  }, [])

  return {
    ...state,
    showWelcome,
    showCompletion,
    mounted,
    currentStep: ONBOARDING_STEPS[state.tourStepIndex] ?? null,
    totalSteps: ONBOARDING_STEPS.length,
    completedCount: state.completedSteps.length,
    allDone: state.completedSteps.length >= ONBOARDING_STEPS.length,
    isStepCompleted: (key: string) => state.completedSteps.includes(key),
    startTour,
    startTourAt,
    dismissWelcome,
    completeCurrentStep,
    skipStep,
    prevStep,
    closeTour,
    closeCompletion,
    completeStepByKey,
    resetOnboarding,
  }
}
