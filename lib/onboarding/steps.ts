// Progreso ORG-SCOPED de la configuración inicial de la agencia.
//
// El contenido de los pasos (títulos, textos, anclas) vive en
// lib/tours/definitions/setup-cuenta.ts. Acá queda solo el estado persistido,
// que consumen tanto el cliente como el endpoint de persistencia.
//
// ONBOARDING_STEP_KEYS es una lista literal a propósito y no se deriva del
// registry de guías: el sanitizer no debe depender de él (evita un ciclo de
// imports). El test de invariantes verifica que ambas listas coincidan.

export const ONBOARDING_STEP_KEYS = ["empresa", "usuarios", "cuenta", "afip"]

// Key bajo la que se guarda el estado del onboarding en organization_settings
// (KV por org). El progreso es a nivel ORGANIZACIÓN: los pasos (datos de
// empresa, invitar equipo, cuenta financiera, AFIP) son hechos de la agencia,
// no del usuario. Si el admin 1 completó hasta el paso 3, el admin 2 ve ese
// mismo progreso y no rehace lo ya hecho.
export const ONBOARDING_SETTINGS_KEY = "onboarding_state"

// Estado persistido en users.onboarding_state. El estado transitorio del tour
// (paso activo, modales abiertos) NO se persiste — solo el progreso real.
export interface PersistedOnboardingState {
  completedSteps: string[]
  // dismissed: se cerró el modal de bienvenida ("lo hago después"). El welcome
  // no vuelve a auto-aparecer, pero el checklist sigue como recordatorio.
  dismissed: boolean
  // hidden: el usuario descartó el onboarding por completo (X en el checklist).
  // No vuelve a aparecer nada — ni welcome ni checklist.
  hidden: boolean
  completedAt?: string | null
}

export function emptyOnboardingState(): PersistedOnboardingState {
  return { completedSteps: [], dismissed: false, hidden: false, completedAt: null }
}

// Normaliza/valida un estado arbitrario (viene de DB o del body de la API)
// descartando keys desconocidas y tipos inválidos.
export function sanitizeOnboardingState(raw: unknown): PersistedOnboardingState {
  const base = emptyOnboardingState()
  if (!raw || typeof raw !== "object") return base
  const obj = raw as Record<string, unknown>

  const completedSteps = Array.isArray(obj.completedSteps)
    ? Array.from(
        new Set(
          obj.completedSteps.filter(
            (k): k is string => typeof k === "string" && ONBOARDING_STEP_KEYS.includes(k)
          )
        )
      )
    : []

  return {
    completedSteps,
    dismissed: obj.dismissed === true,
    hidden: obj.hidden === true,
    completedAt: typeof obj.completedAt === "string" ? obj.completedAt : null,
  }
}
