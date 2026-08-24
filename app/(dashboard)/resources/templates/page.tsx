import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { DocumentTemplatesPageClient } from "@/components/templates/document-templates-page-client"

export default async function ResourcesTemplatesPage() {
  const { user } = await getCurrentUser()
  if (!user.org_id) return null
  const supabase = await createServerClient()
  const scope = await resolveAgencyPermissionScope(supabase, user, "settings", "write")
  if (scope.agencyIds.length === 0) {
    return <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">No tenés permiso para administrar modelos de documentos.</div>
  }
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("org_id", user.org_id)
    .in("id", scope.agencyIds)
    .order("name")

  return <DocumentTemplatesPageClient agencies={agencies ?? []} />
}

