import Link from "next/link"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction, getScopedAgenciesForUser } from "@/lib/permissions-api"
import { hasAdminRole } from "@/lib/permissions"
import { fetchPackagesWithAvailability } from "@/lib/packages/queries"
import { PackagesPageClient } from "@/components/packages/packages-page-client"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export const dynamic = "force-dynamic"

function Shell({ children }: { children: React.ReactNode }) {
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
            <BreadcrumbPage>Paquetería</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paquetería</h1>
        <p className="text-muted-foreground">
          Paquetes cerrados y cuántas plazas quedan de cada uno.
        </p>
      </div>

      {children}
    </div>
  )
}

export default async function PackagesPage() {
  const { user, supabase, agencyIds, matrix } = await getRequestPermissions()

  if (!user.org_id || !canPerformAction(user, "packages", "read", matrix ?? undefined)) {
    return (
      <Shell>
        <p className="text-muted-foreground">No tenés permiso para ver la paquetería.</p>
      </Shell>
    )
  }

  let initialPackages
  try {
    initialPackages = await fetchPackagesWithAvailability(supabase, {
      orgId: user.org_id,
      agencyIds,
    })
  } catch (error) {
    // El cupo es el dato central: mostrar la tabla con ceros sería peor que
    // decir que no se pudo calcular.
    console.error("Error cargando paquetes:", error)
    return (
      <Shell>
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          No se pudieron cargar los paquetes. Recargá la página; si sigue igual, avisá a soporte.
        </div>
      </Shell>
    )
  }

  const agencies = await getScopedAgenciesForUser(supabase as any, user as any)

  return (
    <Shell>
      <PackagesPageClient
        initialPackages={initialPackages}
        agencies={agencies}
        canWrite={canPerformAction(user, "packages", "write", matrix ?? undefined)}
        canDelete={
          hasAdminRole((user as any).roles ?? [user.role]) &&
          canPerformAction(user, "packages", "delete", matrix ?? undefined)
        }
      />
    </Shell>
  )
}
