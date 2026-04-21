import Link from "next/link"

interface Props {
  subscription_status: string
  current_period_ends_at: string | null
  trial_ends_at: string | null
}

function fmt(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/**
 * Banner global en el layout del dashboard. Se muestra cuando el estado
 * del tenant requiere atención (PAST_DUE, CANCELLED con acceso, TRIALING).
 * Para ACTIVE sin alertas, retorna null (no renderiza).
 */
export function SubscriptionBanner({ subscription_status, current_period_ends_at, trial_ends_at }: Props) {
  if (subscription_status === "PAST_DUE") {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span className="text-red-900">
          ⚠️ No pudimos cobrar tu última cuota. Actualizá tu medio de pago para no perder el acceso.
        </span>
        <Link href="/settings/subscription" className="text-red-700 underline font-medium whitespace-nowrap">
          Actualizar tarjeta
        </Link>
      </div>
    )
  }

  if (
    subscription_status === "CANCELLED" &&
    current_period_ends_at &&
    new Date(current_period_ends_at).getTime() > Date.now()
  ) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span className="text-blue-900">
          Tu suscripción está cancelada. Mantenés acceso hasta el {fmt(current_period_ends_at)}.
        </span>
        <Link href="/settings/subscription" className="text-blue-700 underline font-medium whitespace-nowrap">
          Reactivar
        </Link>
      </div>
    )
  }

  if (subscription_status === "TRIALING" && trial_ends_at) {
    const days = daysUntil(trial_ends_at)
    if (days !== null && days <= 2) {
      return (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-sm">
          Primer cobro el {fmt(trial_ends_at)} — {days === 0 ? "¡hoy!" : `quedan ${days} ${days === 1 ? "día" : "días"}`}.
        </div>
      )
    }
    return (
      <div className="bg-green-50 border-b border-green-200 px-6 py-3 text-sm text-green-900">
        Estás en período de prueba durante 7 días hasta el {fmt(trial_ends_at)}.
      </div>
    )
  }

  return null
}
