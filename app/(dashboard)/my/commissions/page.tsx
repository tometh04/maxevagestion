import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { CommissionsPageClient } from "@/components/commissions/commissions-page-client"

export default async function MyCommissionsPage() {
  const { user } = await getCurrentUser()

  // Permitir acceso a SELLER, ADMIN y SUPER_ADMIN (si tienen operaciones asignadas)
  if (!["SELLER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Acceso denegado</h1>
          <p className="text-muted-foreground mt-2">Solo vendedores, administradores y super administradores pueden ver sus comisiones</p>
        </div>
      </div>
    )
  }

  return <CommissionsPageClient sellerId={user.id} />
}

