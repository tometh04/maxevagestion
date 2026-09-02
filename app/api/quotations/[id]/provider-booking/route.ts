import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  canAccessAgencyResource,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { syncProviderBooking } from "@/lib/provider-booking/booking"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })

    const { id } = await params
    const supabase = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "operations", "read")
    if (scope.memberAgencyIds.length === 0) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 })

    const admin = createAdminClient()
    const { data: quotation, error: quotationError } = await admin
      .from("quotations")
      .select("id,org_id,agency_id")
      .eq("id", id)
      .eq("org_id", user.org_id)
      .in("agency_id", scope.memberAgencyIds)
      .maybeSingle()
    if (quotationError || !quotation || !canAccessAgencyResource(scope, quotation)) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 })
    }

    const { data: booking, error: bookingError } = await (admin as any)
      .from("quotation_provider_bookings")
      .select("id,remote_job_id,agency_id")
      .eq("quotation_id", quotation.id)
      .eq("org_id", user.org_id)
      .eq("agency_id", quotation.agency_id)
      .maybeSingle()
    if (bookingError || !booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 })

    const data = await syncProviderBooking({
      admin,
      orgId: user.org_id,
      agencyId: quotation.agency_id,
      booking,
    })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar el estado de la reserva" }, { status: 502 })
  }
}
