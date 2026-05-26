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
    // Grace period: 3 días después de current_period_ends_at (alineado con guard.ts)
    const GRACE_DAYS = 3
    const graceDeadline = current_period_ends_at
      ? new Date(new Date(current_period_ends_at).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
      : null
    const graceDaysLeft = graceDeadline
      ? Math.max(0, Math.ceil((graceDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0

    return (
      <div className="bg-destructive/10 border-b border-destructive/20 px-6 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span className="text-destructive font-medium">
          {graceDaysLeft <= 0
            ? "⛔ Tu cuenta está bloqueada por falta de pago. Regularizá para recuperar el acceso."
            : graceDaysLeft === 1
              ? "⚠️ Tu pago está vencido. Te queda 1 día para regularizar antes de perder el acceso."
              : `⚠️ Tu pago está vencido. Tenés ${graceDaysLeft} días para regularizar antes de perder el acceso.`}
        </span>
        <Link href="/settings/subscription" className="bg-destructive text-destructive-foreground px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap hover:bg-destructive/90 transition-colors">
          Regularizar pago
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
      <div className="bg-primary/5 border-b border-primary/15 px-6 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span className="text-primary">
          Tu suscripción está cancelada. Mantenés acceso hasta el {fmt(current_period_ends_at)}.
        </span>
        <Link href="/settings/subscription" className="text-primary underline font-medium whitespace-nowrap">
          Reactivar
        </Link>
      </div>
    )
  }

  if (subscription_status === "TRIALING" && trial_ends_at) {
    const days = daysUntil(trial_ends_at)
    if (days !== null && days <= 2) {
      return (
        <div className="bg-accent-coral/5 border-b border-accent-coral/15 px-6 py-3 text-sm">
          Primer cobro el {fmt(trial_ends_at)} — {days === 0 ? "¡hoy!" : `quedan ${days} ${days === 1 ? "día" : "días"}`}.
        </div>
      )
    }
    return (
      <div className="bg-success/5 border-b border-success/15 px-6 py-3 text-sm text-success">
        Estás en período de prueba durante 7 días hasta el {fmt(trial_ends_at)}.
      </div>
    )
  }

  return null
}
