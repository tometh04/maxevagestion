import { redirect } from "next/navigation"
import { assertAddonEnabledPage } from "@/lib/addons/guard"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { ReferralsView } from "@/components/referrals/referrals-view"

export const dynamic = "force-dynamic"

/**
 * Panel de referidos (VIB-62): liquidación de comisiones a socios que derivan
 * clientes.
 *
 * VIB-86: se gatea con el módulo propio `referrals`. Antes se colgaba de
 * `commissions` más un chequeo de ownDataOnly, y el vendedor terminaba viendo
 * el ítem en el sidebar para que al entrar lo redirigieran.
 */
export default async function ReferralsPage() {
  const { user, supabase, matrix } = await getRequestPermissions()
  if (!user) redirect("/login")

  if (!canPerformAction(user, "referrals", "read", matrix ?? undefined)) {
    redirect("/dashboard")
  }

  // Complemento contratado. Ojo: se gatea la PANTALLA y el alta de referidores,
  // pero no la lectura de comisiones ya devengadas ni las liquidaciones. Dar de
  // baja el complemento no puede dejar plata que ya se debe sin poder pagarse.
  await assertAddonEnabledPage(supabase, (user as any).org_id, "referrals")

  // Liquidar saca plata de una cuenta, así que además de ver al referidor hace
  // falta poder mover caja. Se resuelve en el servidor y se pasa como prop: la
  // API valida lo mismo, esto sólo evita ofrecer un botón que va a dar 403.
  const canSettle =
    canPerformAction(user, "referrals", "read", matrix ?? undefined) &&
    canPerformAction(user, "cash", "write", matrix ?? undefined)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referidos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Comisiones a las agencias/empresas que te derivan clientes. Se calculan solas por
          cada venta, sobre la ganancia.
        </p>
      </div>
      <ReferralsView canSettle={canSettle} />
    </div>
  )
}
