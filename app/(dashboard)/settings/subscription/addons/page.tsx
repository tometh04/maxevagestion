import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { AddonsManager } from "@/components/billing/addons-manager"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Complementos del tenant. Pantalla hermana de /settings/subscription, no una
 * sección dentro: esa página ya tiene dos ramas (estándar y custom plan) y
 * meterlo ahí obligaba a duplicarlo.
 *
 * Mismo gate que la página de suscripción: quien no maneja facturación no la ve.
 * El endpoint valida el rol por su cuenta — esconder la pantalla no es
 * autorización.
 */
export default async function AddonsPage() {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")

  const roles: string[] = (user as any).roles ?? [(user as any).role]
  const canManageBilling = roles.some(
    (r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "ORG_OWNER"
  )
  if (!canManageBilling) notFound()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/settings/subscription"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Suscripción
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Complementos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sumá o sacá funcionalidades de tu cuenta. Los cambios se reflejan en tu próximo cobro.
        </p>
      </div>

      <AddonsManager />
    </div>
  )
}
