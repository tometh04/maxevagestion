import dynamic from "next/dynamic"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { Skeleton } from "@/components/ui/skeleton"
import { IvaTabs } from "@/components/accounting/iva-tabs"

const IVAPageClient = dynamic(
  () =>
    import("@/components/accounting/iva-page-client").then((m) => ({
      default: m.IVAPageClient,
    })),
  {
    loading: () => (
      <div className="space-y-6">
        <Skeleton className="h-[300px] w-full" />
      </div>
    ),
  }
)

const LibroIvaPage = dynamic(
  () => import("@/app/(dashboard)/accounting/libro-iva/page"),
  {
    loading: () => (
      <div className="space-y-6">
        <Skeleton className="h-[300px] w-full" />
      </div>
    ),
  }
)

export default async function IVAPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  let agencies: Array<{ id: string; name: string }> = []

  if (user.role === "SUPER_ADMIN") {
    const { data } = await supabase.from("agencies").select("id, name").order("name")
    agencies = data || []
  } else if (userAgencies && userAgencies.length > 0) {
    const agencyIds = userAgencies.map((ua: any) => ua.agency_id)
    const { data } = await supabase.from("agencies").select("id, name").in("id", agencyIds)
    agencies = data || []
  }

  return (
    <IvaTabs
      posicionContent={<IVAPageClient agencies={agencies} />}
      libroContent={<LibroIvaPage />}
    />
  )
}
