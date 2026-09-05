import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { getReservation } from "@/lib/provider-booking/reservations"

export const dynamic = "force-dynamic"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id)
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400, headers }
      )
    const id = z
      .string()
      .uuid()
      .safeParse((await params).id)
    if (!id.success)
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404, headers })
    const scope = await resolveAgencyPermissionScope(
      await createServerClient(),
      user,
      "operations",
      "read"
    )
    const data = await getReservation(createAdminClient(), user.org_id, scope, id.data)
    return NextResponse.json(data ? { data } : { error: "Reserva no encontrada" }, {
      status: data ? 200 : 404,
      headers
    })
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error
    return NextResponse.json(
      { error: "No se pudo cargar la reserva. Volvé a intentarlo." },
      { status: 500, headers }
    )
  }
}
