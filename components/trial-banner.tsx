import { createServerClient } from "@/lib/supabase/server"

type OrgInfo = {
  subscription_status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
  trial_ends_at: string | null
  grace_period_ends_at: string | null
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE"
}

export async function TrialBanner({ orgId }: { orgId: string | null }) {
  if (!orgId) return null

  const supabase = await createServerClient()
  const { data } = await (supabase.from("organizations") as any)
    .select("subscription_status, trial_ends_at, grace_period_ends_at, plan")
    .eq("id", orgId)
    .maybeSingle()

  const org = data as OrgInfo | null
  if (!org) return null

  if (org.subscription_status === "ACTIVE" || org.subscription_status === "CANCELLED") {
    return null
  }

  const now = Date.now()

  if (org.subscription_status === "TRIAL" && org.trial_ends_at) {
    const endsAt = new Date(org.trial_ends_at).getTime()
    const daysLeft = Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)))

    if (daysLeft <= 0) {
      return (
        <div className="bg-destructive text-white text-center text-xs py-1.5 px-4 font-medium">
          Tu prueba gratuita expiró. <a href="/settings/subscription" className="underline">Elegí un plan para continuar</a>
        </div>
      )
    }

    const tone = daysLeft <= 2 ? "bg-accent-coral" : "bg-primary"
    return (
      <div className={`${tone} text-white text-center text-xs py-1.5 px-4 font-medium`}>
        Te quedan <strong>{daysLeft}</strong> {daysLeft === 1 ? "día" : "días"} de prueba gratuita.{" "}
        <a href="/settings/subscription" className="underline">Elegir plan</a>
      </div>
    )
  }

  if (org.subscription_status === "PAST_DUE") {
    return (
      <div className="bg-accent-coral text-white text-center text-xs py-1.5 px-4 font-medium">
        Hay un problema con tu pago. <a href="/settings/subscription" className="underline">Actualizá tu método de pago</a>
      </div>
    )
  }

  if (org.subscription_status === "SUSPENDED") {
    return (
      <div className="bg-destructive text-white text-center text-xs py-1.5 px-4 font-medium">
        Tu cuenta está suspendida. <a href="/settings/subscription" className="underline">Reactivá tu suscripción</a>
      </div>
    )
  }

  return null
}
