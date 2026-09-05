import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import {
  listReservations,
  reservationFiltersSchema,
  syncReservations
} from "@/lib/provider-booking/reservations"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id)
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400, headers }
      )
    const parsed = reservationFiltersSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    )
    if (!parsed.success)
      return NextResponse.json({ error: "Los filtros no son válidos" }, { status: 400, headers })
    const scope = await resolveAgencyPermissionScope(
      await createServerClient(),
      user,
      "operations",
      "read"
    )
    if (!scope.agencyIds.length)
      return NextResponse.json(
        { error: "No tenés permiso para consultar reservas" },
        { status: 403, headers }
      )
    const data = await listReservations(createAdminClient(), user.org_id, scope, parsed.data)
    return NextResponse.json({ data }, { headers })
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error
    return NextResponse.json(
      { error: "No se pudieron cargar las reservas. Volvé a intentarlo." },
      { status: 500, headers }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id)
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400, headers }
      )
    const parsed = z
      .object({ bookingIds: z.array(z.string().uuid()).min(1).max(10) })
      .strict()
      .safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return NextResponse.json(
        { error: "La selección de reservas no es válida" },
        { status: 400, headers }
      )
    const scope = await resolveAgencyPermissionScope(
      await createServerClient(),
      user,
      "operations",
      "read"
    )
    if (!scope.agencyIds.length)
      return NextResponse.json(
        { error: "No tenés permiso para consultar reservas" },
        { status: 403, headers }
      )
    const data = await syncReservations(
      createAdminClient(),
      user.org_id,
      scope,
      parsed.data.bookingIds
    )
    return NextResponse.json({ data }, { headers })
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error
    return NextResponse.json(
      { error: "No se pudieron actualizar las reservas. Volvé a intentarlo." },
      { status: 502, headers }
    )
  }
}
