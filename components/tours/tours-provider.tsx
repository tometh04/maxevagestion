"use client"

// Estado y máquina de las guías in-app.
//
// Un solo provider maneja DOS stores porque los progresos tienen dueños
// distintos:
//  - scope "user"  → users.onboarding_state. "Ya vi la guía de operaciones" es
//    un hecho de la persona.
//  - scope "org"   → organization_settings. El setup inicial (datos de empresa,
//    equipo, cuenta financiera, AFIP) son hechos de la agencia y se comparten
//    entre sus admins.
//
// Se monta dentro de SidebarProvider (necesita useSidebar para saber si está en
// mobile) y dentro de PermissionsProvider (usa la matriz YA resuelta para
// descartar pasos que este usuario no puede ver; no re-deriva permisos).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useSidebar } from "@/components/ui/sidebar"
import { usePermissions } from "@/components/permissions/permissions-provider"
import { assertPermission } from "@/lib/permissions/resolved"
import type { Module } from "@/lib/permissions"
import {
  getTourById,
  normalizePath,
  resolveTourForPath,
  tourCoversPath,
  TOURS,
} from "@/lib/tours/registry"
import { resolveVisibleSteps } from "@/lib/tours/filter"
import { entryStepIndex } from "@/lib/tours/entry"
import { isAnchorActive } from "./use-tour-prepare"
import type { TourDefinition, TourPermission, TourStep } from "@/lib/tours/types"
import {
  emptyTourState,
  isTourUnseen,
  markTourFinished,
  markTourProgress,
  markTourStarted,
  sanitizeTourState,
  shouldAutoStart,
  type PersistedTourState,
  type TourStatus,
} from "@/lib/tours/state"
import {
  sanitizeOnboardingState,
  type PersistedOnboardingState,
} from "@/lib/onboarding/steps"

/** Deja aterrizar los datos de la ruta antes de iluminar nada. */
const AUTOSTART_DELAY_MS = 600

interface ActiveTour {
  tourId: string
  stepIndex: number
}

interface ToursContextValue {
  activeTour: TourDefinition | null
  activeStep: TourStep | null
  visibleSteps: TourStep[]
  stepIndex: number
  /** La guía que corresponde al pathname actual, haya arrancado o no. */
  tourForCurrentPath: TourDefinition | null
  /** Guías que este usuario puede correr, con su estado. */
  availableTours: Array<{ tour: TourDefinition; status: TourStatus | null }>
  /** ¿Le queda algo por descubrir en esta guía? Alimenta el punto del menú. */
  isUnseen: (tourId: string) => boolean
  toursDisabled: boolean
  start: (tourId: string, atIndex?: number) => void
  /**
   * Paso por el que abrir una guía desde el menú: primero el que corresponde a
   * lo que hay en pantalla, si no el que quedó a medias, si no el principio.
   * Devuelve también su título para poder anunciarlo antes de abrirla.
   */
  entryStepFor: (tourId: string) => { index: number; title: string | null }
  next: () => void
  prev: () => void
  close: () => void
  setToursDisabled: (value: boolean) => void
  resetAll: () => void
  /** El overlay avisa que el ancla del paso nunca apareció. */
  reportMissingTarget: () => void
  reportStepShown: () => void
  /** Progreso del setup inicial (org-scoped), para el checklist del dashboard. */
  orgSetup: PersistedOnboardingState
  canRunSetup: boolean
  hideSetupChecklist: () => void
}

const ToursContext = createContext<ToursContextValue | null>(null)

export function useTours(): ToursContextValue {
  const ctx = useContext(ToursContext)
  if (!ctx) throw new Error("useTours debe usarse dentro de <ToursProvider>")
  return ctx
}

function persistUserState(state: PersistedTourState) {
  try {
    // keepalive: el request tiene que sobrevivir si el paso siguiente navega.
    void fetch("/api/tours/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

function persistOrgState(state: PersistedOnboardingState) {
  try {
    void fetch("/api/onboarding/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

export function ToursProvider({
  initialUserState,
  initialOrgSetupState,
  roles,
  canRunSetup,
  children,
}: {
  initialUserState?: unknown
  initialOrgSetupState?: PersistedOnboardingState | null
  roles: string[]
  canRunSetup: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { isMobile } = useSidebar()
  const { role, matrix } = usePermissions()

  const [userState, setUserState] = useState<PersistedTourState>(() =>
    initialUserState ? sanitizeTourState(initialUserState) : emptyTourState()
  )
  const [orgSetup, setOrgSetup] = useState<PersistedOnboardingState>(() =>
    sanitizeOnboardingState(initialOrgSetupState)
  )
  const [active, setActive] = useState<ActiveTour | null>(null)
  const [mounted, setMounted] = useState(false)

  // Si un tour no logra iluminar NINGÚN paso, se aborta sin marcarlo como visto
  // para que vuelva a intentar cuando la pantalla tenga sus anclas.
  const shownAnyRef = useRef(false)

  const can = useCallback(
    (module: Module, permission: TourPermission) =>
      assertPermission(role, matrix, module, permission),
    [role, matrix]
  )

  const filterCtx = useMemo(() => ({ isMobile, can }), [isMobile, can])

  const activeTour = active ? getTourById(active.tourId) : null

  const visibleSteps = useMemo(
    () => (activeTour ? resolveVisibleSteps(activeTour, roles, filterCtx) : []),
    [activeTour, roles, filterCtx]
  )

  const stepIndex = active ? Math.min(active.stepIndex, Math.max(0, visibleSteps.length - 1)) : 0
  const activeStep = visibleSteps[stepIndex] ?? null

  const tourForCurrentPath = useMemo(() => {
    const tour = resolveTourForPath(pathname || "/")
    if (!tour) return null
    if (tour.scope === "org" && !canRunSetup) return null
    return resolveVisibleSteps(tour, roles, filterCtx).length > 0 ? tour : null
  }, [pathname, roles, filterCtx, canRunSetup])

  const availableTours = useMemo(
    () =>
      TOURS.filter((tour) => {
        if (tour.scope === "org" && !canRunSetup) return false
        return resolveVisibleSteps(tour, roles, filterCtx).length > 0
      }).map((tour) => ({
        tour,
        status:
          tour.scope === "org"
            ? orgSetup.completedSteps.length >= tour.steps.length
              ? ("completed" as TourStatus)
              : orgSetup.dismissed
                ? ("dismissed" as TourStatus)
                : null
            : (userState.seenTours[tour.id]?.status ?? null),
      })),
    [roles, filterCtx, canRunSetup, userState.seenTours, orgSetup]
  )

  // ── Persistencia ────────────────────────────────────────────────────────

  const commitUserState = useCallback((next: PersistedTourState) => {
    setUserState(next)
    persistUserState(next)
  }, [])

  const commitOrgState = useCallback((next: PersistedOnboardingState) => {
    setOrgSetup(next)
    persistOrgState(next)
  }, [])

  // ── Control del tour ────────────────────────────────────────────────────

  const start = useCallback(
    (tourId: string, atIndex = 0) => {
      const tour = getTourById(tourId)
      if (!tour) return
      shownAnyRef.current = false
      setActive({ tourId, stepIndex: atIndex })
      if (tour.scope === "user") {
        setUserState((prev) => {
          const next = markTourStarted(prev, tourId, new Date().toISOString())
          persistUserState(next)
          return next
        })
      }
    },
    []
  )

  const isUnseen = useCallback(
    (tourId: string) => {
      const tour = getTourById(tourId)
      // El setup es org-scoped: "sin ver" ahí significa que la agencia todavía
      // no terminó de configurarse, no que esta persona no lo haya mirado.
      if (tour?.scope === "org") {
        return !orgSetup.hidden && orgSetup.completedSteps.length < tour.steps.length
      }
      return isTourUnseen(userState, tourId)
    },
    [userState, orgSetup]
  )

  const entryStepFor = useCallback(
    (tourId: string) => {
      const tour = getTourById(tourId)
      if (!tour) return { index: 0, title: null }
      const steps = resolveVisibleSteps(tour, roles, filterCtx)
      if (!steps.length) return { index: 0, title: null }

      // Lo que el usuario tiene delante manda: pidió "la guía de esta
      // pantalla", no el recorrido entero desde el principio.
      let index = entryStepIndex(steps, isAnchorActive)

      if (index === 0) {
        const seen = userState.seenTours[tourId]
        if (seen?.status === "in_progress") {
          index = Math.min(Math.max(seen.lastStepIndex, 0), steps.length - 1)
        }
      }

      return { index, title: steps[index]?.title ?? null }
    },
    [roles, filterCtx, userState.seenTours]
  )

  const finish = useCallback(
    (status: Extract<TourStatus, "completed" | "dismissed">) => {
      const current = active
      setActive(null)
      if (!current) return
      const tour = getTourById(current.tourId)
      if (!tour) return

      if (tour.scope === "user") {
        setUserState((prev) => {
          const next = markTourFinished(
            prev,
            current.tourId,
            status,
            current.stepIndex,
            new Date().toISOString()
          )
          persistUserState(next)
          return next
        })
      } else {
        // El setup org marca sus pasos con completesSetupKey; cerrarlo solo
        // apaga el modal de bienvenida, el checklist sigue como recordatorio.
        commitOrgState({ ...orgSetup, dismissed: true })
      }
    },
    [active, orgSetup, commitOrgState]
  )

  /** Aborta sin dejar rastro: la pantalla no tenía las anclas del tour. */
  const abort = useCallback(() => {
    const current = active
    setActive(null)
    if (!current) return
    const tour = getTourById(current.tourId)
    if (tour?.scope === "user") {
      setUserState((prev) => {
        const seenTours = { ...prev.seenTours }
        delete seenTours[current.tourId]
        const next = { ...prev, seenTours }
        persistUserState(next)
        return next
      })
    }
  }, [active])

  const goToIndex = useCallback(
    (index: number) => {
      const current = active
      if (!current) return
      const tour = getTourById(current.tourId)
      if (!tour) return

      if (index >= visibleSteps.length) {
        finish("completed")
        return
      }
      if (index < 0) return

      setActive({ ...current, stepIndex: index })

      if (tour.scope === "user") {
        // Se persiste en cada paso (no solo al terminar) para que "Continuar"
        // desde el menú retome donde quedó aunque haya recargado la página.
        setUserState((prev) => {
          const next = markTourProgress(prev, current.tourId, index)
          persistUserState(next)
          return next
        })
      }
      // El paso del setup que se deja atrás cuenta como hecho.
      const leaving = visibleSteps[current.stepIndex]
      if (tour.scope === "org" && index > current.stepIndex && leaving?.completesSetupKey) {
        const key = leaving.completesSetupKey
        if (!orgSetup.completedSteps.includes(key)) {
          const completedSteps = [...orgSetup.completedSteps, key]
          commitOrgState({
            ...orgSetup,
            completedSteps,
            completedAt:
              completedSteps.length >= tour.steps.length
                ? (orgSetup.completedAt ?? new Date().toISOString())
                : orgSetup.completedAt,
          })
        }
      }
    },
    [active, visibleSteps, finish, orgSetup, commitOrgState]
  )

  const next = useCallback(() => goToIndex(stepIndex + 1), [goToIndex, stepIndex])
  const prev = useCallback(() => goToIndex(stepIndex - 1), [goToIndex, stepIndex])
  const close = useCallback(() => finish("dismissed"), [finish])

  const reportStepShown = useCallback(() => {
    shownAnyRef.current = true
  }, [])

  const reportMissingTarget = useCallback(() => {
    if (!active) return
    const nextIndex = stepIndex + 1
    if (nextIndex >= visibleSteps.length) {
      if (shownAnyRef.current) finish("completed")
      else abort()
      return
    }
    setActive({ ...active, stepIndex: nextIndex })
  }, [active, stepIndex, visibleSteps.length, finish, abort])

  const setToursDisabled = useCallback(
    (value: boolean) => {
      if (value) setActive(null)
      commitUserState({ ...userState, toursDisabled: value })
    },
    [userState, commitUserState]
  )

  const resetAll = useCallback(() => {
    setActive(null)
    commitUserState({ ...emptyTourState(), toursDisabled: userState.toursDisabled })
  }, [userState.toursDisabled, commitUserState])

  const hideSetupChecklist = useCallback(() => {
    setActive((prev) => (prev && getTourById(prev.tourId)?.scope === "org" ? null : prev))
    commitOrgState({ ...orgSetup, hidden: true, dismissed: true })
  }, [orgSetup, commitOrgState])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Nada de retomar la guía sola al cargar la página.
  //
  // Hubo un espejo en sessionStorage que reabría el tour en el paso donde había
  // quedado. Era peor que el problema que resolvía: al entrar a la pantalla te
  // saltaba a la mitad de un recorrido que no pediste y, si ese paso tenía
  // `route`, te llevaba a otra pantalla de prepo. El progreso ya vive en la DB
  // (lastStepIndex) y se retoma explícitamente desde el menú "Guías".

  // ── Cortar la guía si el usuario se va de su pantalla ───────────────────

  useEffect(() => {
    if (!active || !activeStep) return
    const tour = getTourById(active.tourId)
    if (!tour) return

    // Navegación pendiente del propio paso: todavía no llegamos a destino, no
    // es que el usuario se haya ido. Pasa siempre que la guía se abre desde el
    // menú estando en otra pantalla — sin esto se mataba a sí misma antes de
    // que el router terminara de moverse.
    if (activeStep.route && normalizePath(activeStep.route) !== normalizePath(pathname || "/")) {
      return
    }

    if (tourCoversPath(tour, pathname || "/")) return
    // Se cierra en silencio: quedó in_progress y se retoma desde el menú.
    setActive(null)
  }, [pathname, active, activeStep])

  // ── Auto-disparo al entrar a una pantalla nueva ─────────────────────────

  useEffect(() => {
    if (!mounted || active) return
    const tour = tourForCurrentPath
    if (!tour || !tour.autoStart) return

    if (tour.scope === "org") {
      if (orgSetup.hidden || orgSetup.dismissed) return
      if (orgSetup.completedSteps.length >= tour.steps.length) return
    } else if (!shouldAutoStart(userState, tour.id)) {
      return
    }

    const timer = setTimeout(() => start(tour.id, 0), AUTOSTART_DELAY_MS)
    return () => clearTimeout(timer)
  }, [mounted, active, tourForCurrentPath, userState, orgSetup, start])

  const value = useMemo<ToursContextValue>(
    () => ({
      activeTour,
      activeStep,
      visibleSteps,
      stepIndex,
      tourForCurrentPath,
      availableTours,
      isUnseen,
      toursDisabled: userState.toursDisabled,
      start,
      entryStepFor,
      next,
      prev,
      close,
      setToursDisabled,
      resetAll,
      reportMissingTarget,
      reportStepShown,
      orgSetup,
      canRunSetup,
      hideSetupChecklist,
    }),
    [
      activeTour,
      activeStep,
      visibleSteps,
      stepIndex,
      tourForCurrentPath,
      availableTours,
      isUnseen,
      userState.toursDisabled,
      start,
      entryStepFor,
      next,
      prev,
      close,
      setToursDisabled,
      resetAll,
      reportMissingTarget,
      reportStepShown,
      orgSetup,
      canRunSetup,
      hideSetupChecklist,
    ]
  )

  return <ToursContext.Provider value={value}>{children}</ToursContext.Provider>
}
