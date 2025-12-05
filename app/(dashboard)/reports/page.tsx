import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { ReportsPageClient } from "@/components/reports/reports-page-client"

export default async function ReportsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Obtener vendedores para el filtro
  const { data: sellers } = await supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .order("name")

  // Obtener agencias para el filtro
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .order("name")

  return (
    <ReportsPageClient
      userRole={user.role}
      userId={user.id}
      sellers={sellers || []}
      agencies={agencies || []}
    />
  )
}
