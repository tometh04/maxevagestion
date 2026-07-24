import { redirect } from "next/navigation"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"
import { ReferralsView } from "@/components/referrals/referrals-view"

export const dynamic = "force-dynamic"

/**
 * Panel de referidos (VIB-62): liquidación de comisiones a socios que derivan
 * clientes. Mismo gating que Comisiones del vendedor: lo ve quien administra
 * comisiones (no un vendedor limitado a lo propio, porque las comisiones de
 * referido no son de un vendedor).
 */
export default async function ReferralsPage() {
  const { user, matrix } = await getRequestPermissions()
  if (!user) redirect("/login")

  const canManage =
    canPerformAction(user, "commissions", "read", matrix ?? undefined) &&
    !isOwnDataOnlyResolved(user, "commissions", matrix ?? undefined)

  if (!canManage) {
    redirect("/dashboard")
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referidos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Comisiones a las agencias/empresas que te derivan clientes. Se calculan solas por
          cada venta, sobre la ganancia.
        </p>
      </div>
      <ReferralsView />
    </div>
  )
}
