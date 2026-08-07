// Estado PER-USUARIO de las guías in-app.
//
// Se persiste en users.onboarding_state (jsonb). Esa columna ya existía desde
// 20260630000002 pero nunca se usó: el onboarding viejo terminó guardando su
// progreso en organization_settings porque sus pasos son hechos de la agencia.
// Las guías por pantalla sí son de cada persona, así que acá vive lo per-user.
//
// El progreso ORG del setup inicial sigue en lib/onboarding/steps.ts.

import { TOUR_IDS } from "./registry"

export const TOUR_STATE_VERSION = 1

/**
 * "preexisting" = el usuario ya usaba el sistema antes de que esta guía
 * existiera. No es que la haya visto: es que no queremos interrumpirle el
 * trabajo con un recorrido de algo que ya aprendió a los golpes.
 *
 * Se distingue de "dismissed" a propósito. Las dos frenan el auto-disparo, pero
 * una guía "preexisting" sigue contando como no vista para el punto del menú,
 * que es lo que le avisa que está disponible si la quiere.
 */
export type TourStatus = "in_progress" | "completed" | "dismissed" | "preexisting"

const TOUR_STATUSES: TourStatus[] = ["in_progress", "completed", "dismissed", "preexisting"]

export interface SeenTour {
  status: TourStatus
  /** Último paso alcanzado, para poder retomar donde quedó. */
  lastStepIndex: number
  startedAt: string | null
  completedAt: string | null
  dismissedAt: string | null
}

export interface PersistedTourState {
  version: number
  /** tourId → progreso. La ausencia de un id significa "nunca la vio". */
  seenTours: Record<string, SeenTour>
  /** El usuario apagó el auto-disparo de guías. */
  toursDisabled: boolean
}

export function emptyTourState(): PersistedTourState {
  return { version: TOUR_STATE_VERSION, seenTours: {}, toursDisabled: false }
}

function sanitizeSeenTour(raw: unknown): SeenTour | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>

  const status = TOUR_STATUSES.includes(obj.status as TourStatus)
    ? (obj.status as TourStatus)
    : "in_progress"

  const rawIndex = obj.lastStepIndex
  const lastStepIndex =
    typeof rawIndex === "number" && Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0

  const str = (v: unknown) => (typeof v === "string" ? v : null)

  return {
    status,
    lastStepIndex,
    startedAt: str(obj.startedAt),
    completedAt: str(obj.completedAt),
    dismissedAt: str(obj.dismissedAt),
  }
}

/**
 * Normaliza un estado arbitrario (viene de la DB o del body de la API)
 * descartando keys desconocidas, tourIds que ya no existen y tipos inválidos.
 * Mismo criterio que sanitizeOnboardingState en lib/onboarding/steps.ts.
 *
 * Es idempotente: sanitize(sanitize(x)) === sanitize(x).
 */
export function sanitizeTourState(raw: unknown): PersistedTourState {
  const base = emptyTourState()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const obj = raw as Record<string, unknown>

  const seenTours: Record<string, SeenTour> = {}
  const rawSeen = obj.seenTours
  if (rawSeen && typeof rawSeen === "object" && !Array.isArray(rawSeen)) {
    for (const [tourId, value] of Object.entries(rawSeen as Record<string, unknown>)) {
      // Un tourId que ya no está en el registry se descarta: el estado se
      // autolimpia cuando se renombra o se retira una guía.
      if (!TOUR_IDS.includes(tourId)) continue
      const seen = sanitizeSeenTour(value)
      if (seen) seenTours[tourId] = seen
    }
  }

  return {
    version: TOUR_STATE_VERSION,
    seenTours,
    toursDisabled: obj.toursDisabled === true,
  }
}

/** Marca un tour como arrancado sin pisar un completado previo. */
export function markTourStarted(
  state: PersistedTourState,
  tourId: string,
  nowIso: string
): PersistedTourState {
  const prev = state.seenTours[tourId]
  return {
    ...state,
    seenTours: {
      ...state.seenTours,
      [tourId]: {
        status: "in_progress",
        lastStepIndex: 0,
        startedAt: prev?.startedAt ?? nowIso,
        completedAt: prev?.completedAt ?? null,
        dismissedAt: null,
      },
    },
  }
}

export function markTourProgress(
  state: PersistedTourState,
  tourId: string,
  stepIndex: number
): PersistedTourState {
  const prev = state.seenTours[tourId]
  if (!prev) return state
  return {
    ...state,
    seenTours: { ...state.seenTours, [tourId]: { ...prev, lastStepIndex: stepIndex } },
  }
}

export function markTourFinished(
  state: PersistedTourState,
  tourId: string,
  status: Extract<TourStatus, "completed" | "dismissed">,
  stepIndex: number,
  nowIso: string
): PersistedTourState {
  const prev = state.seenTours[tourId]
  return {
    ...state,
    seenTours: {
      ...state.seenTours,
      [tourId]: {
        status,
        lastStepIndex: stepIndex,
        startedAt: prev?.startedAt ?? nowIso,
        completedAt: status === "completed" ? nowIso : (prev?.completedAt ?? null),
        dismissedAt: status === "dismissed" ? nowIso : (prev?.dismissedAt ?? null),
      },
    },
  }
}

/**
 * Una guía auto-arranca solo si el usuario NUNCA la vio. Si quedó a medias
 * (in_progress porque la cerró), no vuelve a saltar sola: se retoma a mano
 * desde el menú "Guías". La idea es guiar, no insistir.
 */
export function shouldAutoStart(state: PersistedTourState, tourId: string): boolean {
  if (state.toursDisabled) return false
  return !state.seenTours[tourId]
}

/**
 * ¿Al usuario todavía le queda algo por descubrir en esta guía?
 *
 * Distinto de shouldAutoStart: una guía marcada "preexisting" no arranca sola
 * pero sí cuenta como no vista, porque el usuario nunca la recorrió. Es lo que
 * mantiene encendido el punto del menú para los usuarios que ya estaban.
 */
export function isTourUnseen(state: PersistedTourState, tourId: string): boolean {
  const seen = state.seenTours[tourId]
  return !seen || seen.status === "preexisting"
}
