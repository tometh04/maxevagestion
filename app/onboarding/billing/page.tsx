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

  // Si ya tiene acceso, no debería estar acá — mandalo al dashboard.
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("name, subscription_status, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (org && isAccessAllowed(org)) redirect("/dashboard")

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-6 max-w-6xl mx-auto w-full">
        <Image src="/vibook-logo.jpeg" alt="Vibook" width={140} height={42} priority />
        <form action="/api/auth/logout" method="POST">
          <button className="text-sm text-muted-foreground hover:underline">
            Cerrar sesión
          </button>
        </form>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">
              Para activar tu cuenta, elegí un plan
            </h1>
            <p className="text-muted-foreground">
              Probá PRO 7 días gratis · No se te cobra hasta el día 8 · Cancelás cuando quieras
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PLAN_ORDER.map((planId) => (
              <PlanCard key={planId} planId={planId} />
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            🔒 Tu tarjeta se guarda en Mercado Pago con cifrado PCI. Nunca vemos los datos completos.
          </p>
        </div>
      </main>
    </div>
  )
}
