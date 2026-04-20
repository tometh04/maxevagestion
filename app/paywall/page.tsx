import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { PLANS, PLAN_ORDER, formatArs } from "@/lib/billing/plans"
import { CheckoutButton } from "@/components/billing/checkout-button"

export const dynamic = "force-dynamic"

export default async function PaywallPage() {
  const { user } = await getCurrentUser()
  if (!user?.org_id) redirect("/onboarding")

  const supabase = await createServerClient()
  const { data: org } = await (supabase.from("organizations") as any)
    .select("name, subscription_status, trial_ends_at, plan, billing_email")
    .eq("id", user.org_id)
    .maybeSingle()

  const status = (org as any)?.subscription_status as string | undefined
  // Si la sub está ACTIVE o TRIAL vigente, no hay que mostrar paywall — mandamos
  // al dashboard. El middleware normalmente nos evita este caso, pero se puede
  // aterrizar acá por bookmark o refresh.
  if (status === "ACTIVE") redirect("/dashboard")
  if (status === "TRIAL" && org?.trial_ends_at && new Date(org.trial_ends_at) > new Date()) {
    redirect("/dashboard")
  }

  const title =
    status === "SUSPENDED"
      ? "Tu cuenta está suspendida"
      : status === "PAST_DUE"
      ? "Tenemos un problema con tu pago"
      : "Tu prueba gratuita expiró"

  const subtitle =
    status === "SUSPENDED"
      ? "Reactivá la suscripción para volver a acceder al sistema."
      : status === "PAST_DUE"
      ? "Actualizá tu método de pago en MercadoPago para seguir operando sin interrupciones."
      : "Elegí un plan para seguir usando MAXEVA sin interrupciones."

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-3xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
          {org?.name && (
            <p className="text-xs text-muted-foreground">{org.name} · {user.email}</p>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId]
            return (
              <div key={plan.id} className="border rounded-lg p-4 bg-background space-y-3">
                <div>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="text-2xl font-bold mt-1">
                    {formatArs(plan.priceArsMonthly)}
                    <span className="text-sm font-normal text-muted-foreground"> / mes</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                </div>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {plan.features.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
                <CheckoutButton plan={plan.id} />
              </div>
            )
          })}
        </div>

        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>
            ¿Necesitás otra opción?{" "}
            <Link href="mailto:hola@maxevagestion.com" className="underline">Escribinos</Link>
          </p>
          <p>
            <Link href="/logout" className="underline">Cerrar sesión</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
