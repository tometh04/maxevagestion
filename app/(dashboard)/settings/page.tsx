import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import {
  getScopedAgenciesForUser,
  getUserAgencyIds,
  canPerformAction,
  isOwnDataOnlyResolved,
} from "@/lib/permissions-api"
import {
  loadFullAgencyMatrix,
  buildDefaultMatrix,
  CONFIGURABLE_ROLES,
  resolveUserPermissions,
} from "@/lib/permissions-agency"
import { SettingsPageClient } from "@/components/settings/settings-page-client"
import { availableExportIds } from "@/lib/exports/catalog"
import type { UserRole } from "@/lib/permissions"

interface SettingsPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams
  const defaultTab = params.tab || "users"
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)

  const firstAgencyId = agencies[0]?.id || null

  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN" && user.role !== "ORG_OWNER") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuenta</h1>
          <p className="text-sm text-muted-foreground">No tienes permisos para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  // Pre-cargar la matriz de permisos de la primera agencia para SSR
  let initialPermissionsMatrix: Record<string, Record<string, { read: boolean; write: boolean; delete: boolean; export: boolean; ownDataOnly: boolean }>> = {}
  let initialPermissionsCustomized: Record<string, string[]> = {}

  if (firstAgencyId && user.org_id) {
    initialPermissionsMatrix = await loadFullAgencyMatrix(supabase as any, firstAgencyId, user.org_id)

    // Calcular qué módulos están customizados vs defaults
    for (const role of CONFIGURABLE_ROLES) {
      const defaults = buildDefaultMatrix(role as UserRole)
      const roleMatrix = initialPermissionsMatrix[role] ?? {}
      initialPermissionsCustomized[role] = Object.keys(roleMatrix).filter((m) => {
        const d = defaults[m]
        const c = roleMatrix[m]
        return (
          d?.read !== c?.read ||
          d?.write !== c?.write ||
          d?.delete !== c?.delete ||
          d?.export !== c?.export ||
          d?.ownDataOnly !== c?.ownDataOnly
        )
      })
    }
  }

  // Qué exportaciones ofrece la pestaña "Exportar datos". Se resuelve acá, con
  // la matriz del usuario, y no en el cliente: la lista es la promesa de qué
  // descargas van a funcionar, y el permiso lo tiene el server.
  const userRoles = ((user as any).roles ?? [user.role]) as string[]
  const exportAgencyIds = await getUserAgencyIds(supabase, user.id, user.role as UserRole)
  const userPerms = user.org_id
    ? await resolveUserPermissions(
        supabase as any,
        user.id,
        user.org_id,
        userRoles,
        exportAgencyIds
      )
    : undefined
  const allowedExportIds = availableExportIds({
    roles: userRoles,
    can: (module, permission) => canPerformAction(user as any, module, permission, userPerms),
    ownDataOnly: (module) => isOwnDataOnlyResolved(user as any, module, userPerms),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cuenta</h1>
        <p className="text-sm text-muted-foreground">Gestiona tu cuenta, usuarios y operadores</p>
      </div>

      <SettingsPageClient
        defaultTab={defaultTab}
        agencies={agencies}
        firstAgencyId={firstAgencyId}
        userRole={user.role}
        allowedExportIds={allowedExportIds}
        initialPermissionsMatrix={initialPermissionsMatrix}
        initialPermissionsCustomized={initialPermissionsCustomized}
      />
    </div>
  )
}

