import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { buildLibraryContext } from "@/lib/library/access"
import { listCategories } from "@/lib/library/category-service"
import { listResourcesForViewer } from "@/lib/library/resource-service"
import { LibraryPageClient } from "@/components/library/library-page-client"

export const metadata = {
  title: "Biblioteca | Vibook",
}

export const dynamic = "force-dynamic"

function Denied() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
        <p className="text-muted-foreground">
          No tiene permiso para acceder a la Biblioteca
        </p>
      </div>
    </div>
  )
}

export default async function LibraryPage() {
  const { user, supabase, matrix } = await getRequestPermissions()

  if (!(user as any)?.org_id) return <Denied />
  if (!canPerformAction(user, "library", "read", matrix ?? undefined)) {
    return <Denied />
  }

  const ctx = buildLibraryContext({ supabase, user: user as any })
  const canManage = canPerformAction(user, "library", "write", matrix ?? undefined)

  const [categories, resources] = await Promise.all([
    listCategories(ctx),
    listResourcesForViewer(ctx, { includeAllTargets: canManage }),
  ])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Biblioteca</h1>
        <p className="text-muted-foreground mt-1">
          Material de capacitación: manuales, instrucciones y mejores prácticas.
        </p>
      </div>

      <LibraryPageClient
        categories={categories}
        resources={resources}
        canManage={canManage}
      />
    </div>
  )
}
