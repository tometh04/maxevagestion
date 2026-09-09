import Link from "next/link"
import { notFound } from "next/navigation"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction, getScopedAgenciesForUser } from "@/lib/permissions-api"
import {
  fetchPackageById,
  fetchPackageConsumingOperations,
  sumSalesByCurrency,
} from "@/lib/packages/queries"
import { PackageDetailClient } from "@/components/packages/package-detail-client"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export const dynamic = "force-dynamic"

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user, supabase, agencyIds, matrix } = await getRequestPermissions()

  if (!user.org_id || !canPerformAction(user, "packages", "read", matrix ?? undefined)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Grupales y Cupo</h1>
        <p className="text-muted-foreground">No tenés permiso para ver Grupales y Cupo.</p>
      </div>
    )
  }

  const pkg = await fetchPackageById(supabase, user.org_id, id)
  // Un paquete de otra org no existe para este usuario.
  if (!pkg) notFound()

  // Un paquete de una oficina que el usuario no ve tampoco.
  if (pkg.agency_id && agencyIds.length > 0 && !agencyIds.includes(pkg.agency_id)) {
    notFound()
  }

  const [operations, agencies] = await Promise.all([
    fetchPackageConsumingOperations(supabase, user.org_id, id),
    getScopedAgenciesForUser(supabase as any, user as any),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/operations">Operaciones</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/packages">Grupales y Cupo</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pkg.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PackageDetailClient
        pkg={pkg}
        operations={operations}
        salesByCurrency={sumSalesByCurrency(operations)}
        agencies={agencies}
        canWrite={canPerformAction(user, "packages", "write", matrix ?? undefined)}
      />
    </div>
  )
}
