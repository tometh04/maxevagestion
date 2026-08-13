import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { buildLibraryContext } from "@/lib/library/access"
import { listCategories } from "@/lib/library/category-service"
import { listResourcesForAdmin } from "@/lib/library/resource-service"
import { LibraryAdminClient } from "@/components/library/admin/library-admin-client"

export const metadata = {
  title: "Gestionar Biblioteca | Vibook",
}

export const dynamic = "force-dynamic"

function Denied() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gestionar Biblioteca</h1>
        <p className="text-muted-foreground">
          No tiene permiso para gestionar la Biblioteca
        </p>
      </div>
    </div>
  )
}

export default async function LibraryAdminPage() {
  const { user, supabase, matrix } = await getRequestPermissions()

  if (!(user as any)?.org_id) return <Denied />
  // Requiere permiso de escritura del módulo.
  if (!canPerformAction(user, "library", "write", matrix ?? undefined)) {
    return <Denied />
  }

  const ctx = buildLibraryContext({ supabase, user: user as any })
  const [categories, resources] = await Promise.all([
    listCategories(ctx),
    listResourcesForAdmin(ctx),
  ])

  return <LibraryAdminClient categories={categories} resources={resources} />
}
