"use client"

import { useState, useCallback, useEffect } from "react"

export interface OnboardingStep {
  key: string
  title: string
  description: string
  route: string
  icon: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "empresa",
    title: "Completar datos de empresa",
    description:
      'Cargá razón social, CUIT, dirección y logo. Esta info aparece en facturas y presupuestos. Completá los campos en el tab "Mi Empresa" y hacé click en Guardar.',
    route: "/settings?tab=interface",
    icon: "🏢",
  },
  {
    key: "usuarios",
    title: "Invitar a tu equipo",
    description:
      "Sumá vendedores, contadores o administradores. Cada rol ve solo lo que le corresponde. Usá el botón Invitar usuario.",
    route: "/settings?tab=users",
    icon: "👥",
  },
  {
    key: "cuenta",
    title: "Crear una cuenta financiera",
    description:
      "Necesitás al menos una cuenta (caja, banco, billetera) para registrar cobros y pagos. Usá el botón + Nueva cuenta.",
    route: "/accounting/financial-accounts",
    icon: "💰",
  },
  {
    key: "afip",
    title: "Conectar AFIP",
    description:
      "Habilitá la facturación electrónica para emitir facturas A, B y C. Subí tu certificado digital y configurá el punto de venta.",
    route: "/settings?tab=afip",
    icon: "📄",
  },
]

interface OnboardingState {
  completedSteps: string[]
  dismissed: boolean
  tourActive: boolean
  tourStepIndex: number
}

const STORAGE_KEY = "vibook_onboarding"

function loadState(): OnboardingState {
  if (typeof window === "undefined") {
    return { completedSteps: [], dismissed: false, tourActive: false, tourStepIndex: 0 }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { completedSteps: [], dismissed: false, tourActive: false, tourStepIndex: 0 }
}

function saveState(state: OnboardingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(loadState)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const s = loadState()
    setState(s)
    if (!s.dismissed && s.completedSteps.length < ONBOARDING_STEPS.length) {
      setShowWelcome(true)
    }
  }, [])

  const update = useCallback((partial: Partial<OnboardingState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial }
      saveState(next)
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
    update({ dismissed: true })
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
        tourStepIndex: allDone ? prev.tourStepIndex : nextIndex,
        tourActive: !allDone && nextIndex < ONBOARDING_STEPS.length,
      }
      saveState(next)
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
        const next = { ...prev, tourActive: false }
        saveState(next)
        if (prev.completedSteps.length >= ONBOARDING_STEPS.length) {
          setShowCompletion(true)
        }
        return next
      }
      const next = { ...prev, tourStepIndex: nextIndex }
      saveState(next)
      return next
    })
  }, [])

  const prevStep = useCallback(() => {
    setState((prev) => {
      if (prev.tourStepIndex <= 0) return prev
      const next = { ...prev, tourStepIndex: prev.tourStepIndex - 1 }
      saveState(next)
      return next
    })
  }, [])

  const closeTour = useCallback(() => {
    update({ tourActive: false, dismissed: true })
  }, [update])

  const closeCompletion = useCallback(() => {
    setShowCompletion(false)
    update({ tourActive: false, dismissed: true })
  }, [update])

  const completeStepByKey = useCallback((key: string) => {
    setState((prev) => {
      if (prev.completedSteps.includes(key)) return prev
      const completedSteps = [...prev.completedSteps, key]
      const next = { ...prev, completedSteps }
      saveState(next)
      return next
    })
  }, [])

  const resetOnboarding = useCallback(() => {
    const fresh: OnboardingState = {
      completedSteps: [],
      dismissed: false,
      tourActive: false,
      tourStepIndex: 0,
    }
    saveState(fresh)
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
