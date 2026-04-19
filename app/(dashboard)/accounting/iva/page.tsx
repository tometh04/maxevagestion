import dynamic from "next/dynamic"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { Skeleton } from "@/components/ui/skeleton"
import { ImpuestosTabs } from "@/components/accounting/impuestos-tabs"
import { IvaTabs } from "@/components/accounting/iva-tabs"

const IVAPageClient = dynamic(
  () =>
    import("@/components/accounting/iva-page-client").then((m) => ({
      default: m.IVAPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

const LibroIvaPage = dynamic(
  () => import("@/app/(dashboard)/accounting/libro-iva/page"),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

const WithholdingsPage = dynamic(
  () => import("@/app/(dashboard)/accounting/withholdings/page"),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

const IIBBPage = dynamic(
  () => import("@/app/(dashboard)/accounting/iibb/page"),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

const GananciasPage = dynamic(
  () => import("@/app/(dashboard)/accounting/ganancias/page"),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

export default async function ImpuestosPage() {
  const { user } = await getCurrentUser()

  if (!canAccessModule(user.role as any, "accounting")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Impuestos</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a impuestos</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)

  return (
    <ImpuestosTabs
      ivaContent={
        <IvaTabs
          posicionContent={<IVAPageClient agencies={agencies} />}
          libroContent={<LibroIvaPage />}
        />
      }
      withholdingsContent={<WithholdingsPage />}
      iibbContent={<IIBBPage />}
      gananciasContent={<GananciasPage />}
    />
  )
}
