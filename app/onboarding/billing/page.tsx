import Image from "next/image"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { PLAN_ORDER } from "@/lib/billing/plans"
import { PlanCard } from "./_components/plan-card"
import { createAdminClient } from "@/lib/supabase/server"
import { isAccessAllowed } from "@/lib/billing/guard"

export default async function OnboardingBillingPage() {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.org_id) redirect("/onboarding")

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("name, subscription_status, current_period_ends_at, trial_ends_at, has_used_trial")
    .eq("id", user.org_id)
    .maybeSingle()

  if (org && isAccessAllowed(org)) redirect("/dashboard")

  const isCancelledExpired =
    org?.subscription_status === "CANCELLED" &&
    org?.current_period_ends_at &&
    new Date(org.current_period_ends_at).getTime() <= Date.now()

  const hasUsedTrial = !!org?.has_used_trial
  const firstName = user.name?.split(" ")[0] || ""

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-6 max-w-6xl mx-auto w-full">
        <Image
          src="/vibook-logo-white.png"
          alt="Vibook"
          width={140}
          height={32}
          priority
          className="h-auto w-auto max-h-10 object-contain"
        />
        <form action="/api/auth/logout" method="POST">
          <button className="text-sm text-muted-foreground hover:text-white transition-colors">
            Cerrar sesión
          </button>
        </form>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 pb-20">
        <div className="max-w-4xl w-full space-y-12">
          <div className="text-center space-y-4">
            <span className="inline-block text-[11px] font-semibold uppercase tracking-eyebrow text-success">
              Activá tu cuenta
            </span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter-hero leading-[1.1] text-white">
              {isCancelledExpired ? (
                <>Tu suscripción venció{firstName ? `, ${firstName}` : ""}</>
              ) : (
                <>
                  {firstName ? `Hola ${firstName}, elegí` : "Elegí"}{" "}
                  <span className="text-gradient-signature">un plan</span> para empezar
                </>
              )}
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
              {isCancelledExpired || hasUsedTrial
                ? "Elegí el plan para continuar. Toda tu información sigue intacta."
                : "Empezá gratis por 7 días. Sin cobro hasta el día 8. Cancelás cuando quieras."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PLAN_ORDER.map((planId) => (
              <PlanCard key={planId} planId={planId} trialAvailable={!hasUsedTrial} />
            ))}
          </div>

          <div className="text-center text-muted-foreground text-sm space-y-1">
            <p>Facturamos por MercadoPago · Cancelás cuando quieras · Exportás tus datos en cualquier momento</p>
            <p className="text-xs">
              🔒 Tu tarjeta se guarda en Mercado Pago con cifrado PCI. Nunca vemos los datos completos.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
