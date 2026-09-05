import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { listReservations, reservationFiltersSchema } from "@/lib/provider-booking/reservations"
import { ReservationsPage } from "@/components/operations/reservations-page"

export const dynamic = "force-dynamic"
export default async function Page() {
  const { user } = await getCurrentUser()
  if (!user.org_id) return <p>No tenés una organización asociada.</p>
  const scope = await resolveAgencyPermissionScope(
    await createServerClient(),
    user,
    "operations",
    "read"
  )
  if (!scope.agencyIds.length) return <p>No tenés permiso para consultar reservas.</p>
  try {
    const initial = await listReservations(
      createAdminClient(),
      user.org_id,
      scope,
      reservationFiltersSchema.parse({})
    )
    return <ReservationsPage initial={initial} />
  } catch {
    return (
      <ReservationsPage
        initial={{ rows: [], total: 0, page: 1, pageSize: 25 }}
        initialError="No se pudieron cargar las reservas. Volvé a intentarlo."
      />
    )
  }
}
