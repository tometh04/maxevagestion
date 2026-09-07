import { notFound, redirect } from "next/navigation"

import { AddonsStore } from "@/components/billing/addons-store"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Complementos: la vitrina del tenant.
 *
 * Vive en el primer nivel y no colgada de Suscripción porque es una sección que
 * se tiene que descubrir sola. La ve solo quien maneja la facturación, que es la
 * única persona que puede contratar: para el resto del equipo no existe, ni en
 * el sidebar ni por URL.
 *
 * El endpoint valida el rol por su cuenta. Esconder la pantalla no es
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
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Complementos</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Funcionalidades que se suman a tu plan. Las activás vos y entran en el próximo cobro, sin
          contratos aparte.
        </p>
      </header>

      <AddonsStore />
    </div>
  )
}
