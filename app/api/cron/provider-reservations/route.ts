import { NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { syncProviderBooking } from "@/lib/provider-booking/booking"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const auth = checkCronAuth(request, "provider-reservations")
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data, error } = await admin
    .from("quotation_provider_bookings")
    .select("id,org_id,agency_id,remote_job_id")
    .or(`sync_attempted_at.is.null,sync_attempted_at.lt.${cutoff}`)
    .order("sync_attempted_at", { ascending: true, nullsFirst: true })
    .limit(10)
  if (error)
    return NextResponse.json({ error: "No se pudo consultar la cola de reservas" }, { status: 500 })
  const results = await Promise.allSettled(
    (data ?? []).map((booking) =>
      syncProviderBooking({ admin, orgId: booking.org_id, agencyId: booking.agency_id, booking })
    )
  )
  const failed = results.filter((result) => result.status === "rejected").length
  return NextResponse.json(
    { updated: results.length - failed, failed },
    { status: failed ? 502 : 200 }
  )
}
