import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { hasAdminRole } from "@/lib/permissions"

/**
 * PUT /api/settings/users/[id]/agencies
 *
 * Reasigna a qué agencias de la organización pertenece un usuario. Hasta ahora
 * la membresía sólo se podía definir al invitar (`/api/settings/users/invite`):
 * si alguien quedaba en la agencia equivocada, o pasaba a trabajar en las dos,
 * no había forma de arreglarlo desde la app.
 *
 * `user_agencies` es lo que lee `getUserAgencyIds()` para acotar el alcance de
 * ADMIN, SELLER y VIEWER, así que esto mueve permisos: se valida tenant en las
 * dos puntas (usuario destino y agencias pedidas) y no se confía sólo en la RLS
 * de `user_agencies`.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    // hasAdminRole en vez de comparar user.role contra strings: el dueño del
    // tenant (ORG_OWNER) y quien tiene ADMIN como rol adicional también
    // administran usuarios. Ver VIB-127.
    if (!hasAdminRole((user as any).roles ?? [user.role])) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    if (!user.org_id) {
      return NextResponse.json(
        { error: "Usuario sin organizacion asociada" },
        { status: 400 }
      )
    }

    const { id: targetUserId } = await params
    if (!targetUserId) {
      return NextResponse.json({ error: "ID de usuario requerido" }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const rawAgencies = body?.agencies

    if (!Array.isArray(rawAgencies) || rawAgencies.some((a: unknown) => typeof a !== "string")) {
      return NextResponse.json(
        { error: "Enviá la lista de agencias del usuario" },
        { status: 400 }
      )
    }

    const requestedIds = Array.from(new Set(rawAgencies as string[])).filter(Boolean)

    // Sin agencias, un SELLER o un ADMIN deja de ver absolutamente todo y el
    // síntoma (pantallas vacías) no se parece en nada a la causa. Se pide lo
    // mismo que al invitar: al menos una.
    if (requestedIds.length === 0) {
      return NextResponse.json(
        { error: "El usuario tiene que pertenecer al menos a una agencia" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    const { data: targetUser } = await supabase
      .from("users")
      .select("id, role, org_id")
      .eq("id", targetUserId)
      .maybeSingle()

    if (!targetUser || (targetUser as any).org_id !== user.org_id) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    if ((targetUser as any).role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "No puedes modificar un usuario SUPER_ADMIN" },
        { status: 403 }
      )
    }

    // Agencias de la org. Sirve para dos cosas: rechazar ids de otro tenant y
    // saber qué filas existentes son "nuestras" y podemos tocar.
    const { data: orgAgencies, error: orgAgenciesError } = await supabase
      .from("agencies")
      .select("id")
      .eq("org_id", user.org_id)

    if (orgAgenciesError) {
      console.error("Error fetching org agencies:", orgAgenciesError)
      return NextResponse.json({ error: "Error al cargar agencias" }, { status: 500 })
    }

    const orgAgencyIds = new Set((orgAgencies || []).map((a: any) => a.id as string))
    const foreign = requestedIds.filter((id) => !orgAgencyIds.has(id))
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: "Alguna de las agencias no pertenece a tu organizacion" },
        { status: 400 }
      )
    }

    const { data: currentRows, error: currentError } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", targetUserId)

    if (currentError) {
      console.error("Error fetching user agencies:", currentError)
      return NextResponse.json(
        { error: "Error al cargar las agencias del usuario" },
        { status: 500 }
      )
    }

    const currentIds = (currentRows || []).map((r: any) => r.agency_id as string)
    // Sólo se administran las membresías dentro de la org del que edita. Si
    // quedara una fila apuntando a otro tenant (dato viejo o corrupto), no es
    // algo que esta pantalla deba borrar en silencio.
    const currentInOrg = currentIds.filter((id) => orgAgencyIds.has(id))

    const toAdd = requestedIds.filter((id) => !currentIds.includes(id))
    const toRemove = currentInOrg.filter((id) => !requestedIds.includes(id))

    if (toAdd.length === 0 && toRemove.length === 0) {
      return NextResponse.json({ success: true, agencies: currentIds })
    }

    // Se quita primero y se agrega después a propósito: si el segundo paso
    // falla, el usuario queda con MENOS acceso del pedido, no con más.
    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("user_agencies")
        .delete()
        .eq("user_id", targetUserId)
        .in("agency_id", toRemove)

      if (deleteError) {
        console.error("Error removing user agencies:", deleteError)
        return NextResponse.json(
          { error: "Error al actualizar las agencias del usuario" },
          { status: 500 }
        )
      }
    }

    if (toAdd.length > 0) {
      const { error: insertError } = await (supabase.from("user_agencies") as any).insert(
        toAdd.map((agencyId) => ({ user_id: targetUserId, agency_id: agencyId }))
      )

      if (insertError) {
        console.error("Error adding user agencies:", insertError)
        return NextResponse.json(
          {
            error:
              "Se quitaron las agencias desmarcadas pero no se pudieron agregar las nuevas. Volvé a intentar.",
          },
          { status: 500 }
        )
      }
    }

    const finalIds = [
      ...currentIds.filter((id) => !toRemove.includes(id)),
      ...toAdd,
    ]

    try {
      await (supabase.from("audit_logs") as any).insert({
        user_id: user.id,
        action: "UPDATE_USER_AGENCIES",
        entity_type: "user",
        entity_id: targetUserId,
        details: { before: currentIds, after: finalIds, added: toAdd, removed: toRemove },
      })
    } catch (e) {
      // El audit log es best-effort; no bloquea el cambio de membresía.
    }

    return NextResponse.json({ success: true, agencies: finalIds })
  } catch (error: any) {
    console.error("Error updating user agencies:", error)
    return NextResponse.json(
      { error: error?.message || "Error al actualizar las agencias del usuario" },
      { status: 500 }
    )
  }
}
