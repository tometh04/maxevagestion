// Definición de los pasos del onboarding de bienvenida.
//
// Vive en lib/ (no "use client") para que tanto los componentes cliente
// (tour/checklist) como el endpoint server-side de persistencia puedan
// compartir las mismas keys sin importar un módulo client.

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

export const ONBOARDING_STEP_KEYS = ONBOARDING_STEPS.map((s) => s.key)

// Estado persistido en users.onboarding_state. El estado transitorio del tour
// (paso activo, modales abiertos) NO se persiste — solo el progreso real.
export interface PersistedOnboardingState {
  completedSteps: string[]
  dismissed: boolean
  completedAt?: string | null
}

export function emptyOnboardingState(): PersistedOnboardingState {
  return { completedSteps: [], dismissed: false, completedAt: null }
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
    completedAt: typeof obj.completedAt === "string" ? obj.completedAt : null,
  }
}
