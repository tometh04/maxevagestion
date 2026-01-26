import dynamic from "next/dynamic"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { Skeleton } from "@/components/ui/skeleton"

const ReportsPageClient = dynamic(
  () =>
    import("@/components/reports/reports-page-client").then((m) => ({
      default: m.ReportsPageClient,
    })),
  {
    loading: () => (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    ),
  }
)

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
