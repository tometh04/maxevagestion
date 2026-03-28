import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { AdminCommissionsView } from "@/components/commissions/admin-commissions-view"
import { SellerCommissionsView } from "@/components/commissions/seller-commissions-view"

export default async function CommissionsPage() {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"

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
        <AdminCommissionsView userId={user.id} userRole={user.role} />
      ) : (
        <SellerCommissionsView userId={user.id} userRole={user.role} />
      )}
    </div>
  )
}
