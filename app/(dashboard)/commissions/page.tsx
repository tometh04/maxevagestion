import { redirect } from "next/navigation"
import { AdminCommissionsView } from "@/components/commissions/admin-commissions-view"
import { SellerCommissionsView } from "@/components/commissions/seller-commissions-view"
import { getRequestPermissions } from "@/lib/permissions/request"
import {
  canPerformAction,
  getScopedAgenciesForUser,
  isOwnDataOnlyResolved,
} from "@/lib/permissions-api"

export default async function CommissionsPage() {
  const { user, supabase, matrix } = await getRequestPermissions()
  if (!user) redirect("/login")

  // Vista "admin" (todas las comisiones) vs "vendedor" (solo las propias) según
  // el matrix por agencia, coherente con /api/commissions. Un ADMIN configurado
  // como "solo comisiones propias" ve la vista de vendedor.
  const isAdmin =
    canPerformAction(user, "commissions", "read", matrix ?? undefined) &&
    !isOwnDataOnlyResolved(user, "commissions", matrix ?? undefined)

  // Oficinas visibles: alimentan el filtro y el agrupamiento por oficina de la
  // pantalla de pago. Se resuelven en el server para no volver a pedirlas.
  const agencies = isAdmin ? await getScopedAgenciesForUser(supabase, user as any) : []

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comisiones</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAdmin
            ? "Gestiona y paga las comisiones de tu equipo de ventas"
            : "Consultá tus comisiones y el historial de pagos"}
        </p>
      </div>
      {isAdmin ? (
        <AdminCommissionsView userId={user.id} userRole={user.role} agencies={agencies} />
      ) : (
        <SellerCommissionsView userId={user.id} userRole={user.role} />
      )}
    </div>
  )
}
