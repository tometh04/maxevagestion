import { NextResponse } from "next/server"
import { z } from "zod"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { hasAdminRole } from "@/lib/permissions"
import {
  fetchPackageById,
  fetchPackageConsumingOperations,
  sumSalesByCurrency,
} from "@/lib/packages/queries"
import { mapPackageRpcError } from "@/lib/packages/errors"

export const dynamic = "force-dynamic"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const itemSchema = z.object({
  operator_id: z.string().uuid("Operador inválido"),
  product_type: z.string().trim().max(60).optional().nullable(),
  cost: z.coerce.number().min(0).default(0),
  cost_currency: z.enum(["ARS", "USD"]).default("USD"),
  sale_amount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(500).optional().nullable(),
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  destination: z.string().trim().max(200).optional().nullable(),
  departure_date: z.string().regex(DATE_ONLY).optional().nullable(),
  return_date: z.string().regex(DATE_ONLY).optional().nullable(),
  total_quota: z.coerce.number().int().min(0).optional(),
  sale_amount_total: z.coerce.number().min(0).optional().nullable(),
  sale_currency: z.enum(["ARS", "USD"]).optional(),
  agency_id: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "CLOSED"]).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z.array(itemSchema).optional(),
  /**
   * Confirmación explícita de que el cliente cargó los ítems existentes antes de
   * mandar la lista. Sin esto, un `items: []` NO borra nada (ver más abajo).
   */
  items_replace: z.boolean().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "packages", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "No tiene permisos para ver paquetes" }, { status: 403 })
    }

    const pkg = await fetchPackageById(supabase, user.org_id, id)
    if (!pkg) {
      // 404 y no 403: un paquete de otra org no existe para este usuario.
      return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 })
    }

    const operations = await fetchPackageConsumingOperations(supabase, user.org_id, id)

    return NextResponse.json({
      package: pkg,
      operations,
      salesByCurrency: sumSalesByCurrency(operations),
    })
  } catch (error: any) {
    console.error("Error in GET /api/packages/[id]:", error)
    return NextResponse.json({ error: "Error al obtener el paquete" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "packages", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "No tiene permisos para editar paquetes" }, { status: 403 })
    }

    const { data: existing } = await (supabase.from("travel_packages") as any)
      .select("id, total_quota")
      .eq("id", id)
      .eq("org_id", user.org_id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 })
    }

    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      )
    }
    const body = parsed.data
    const warnings: string[] = []

    if (body.agency_id) {
      const { data: agency } = await (supabase.from("agencies") as any)
        .select("id")
        .eq("id", body.agency_id)
        .eq("org_id", user.org_id)
        .maybeSingle()
      if (!agency) {
        return NextResponse.json({ error: "La agencia seleccionada no existe" }, { status: 400 })
      }
    }

    // El cupo NO se actualiza como una columna más: pasa por la RPC, que lockea
    // y rechaza (P4302) bajarlo por debajo de lo ya vendido. Si se escribiera
    // directo, el disponible quedaría negativo y la pantalla mentiría.
    if (body.total_quota !== undefined && body.total_quota !== existing.total_quota) {
      const { error: quotaError } = await (supabase.rpc as any)("set_travel_package_quota", {
        p_package_id: id,
        p_org_id: user.org_id,
        p_total_quota: body.total_quota,
      })
      if (quotaError) {
        const mapped = mapPackageRpcError(quotaError, "PATCH /api/packages/[id] (quota)")
        return NextResponse.json(mapped.body, { status: mapped.status })
      }
    }

    const columns: Record<string, unknown> = {}
    for (const key of [
      "name",
      "description",
      "destination",
      "departure_date",
      "return_date",
      "sale_amount_total",
      "sale_currency",
      "agency_id",
      "status",
      "notes",
    ] as const) {
      if (body[key] !== undefined) columns[key] = body[key] === "" ? null : body[key]
    }

    if (Object.keys(columns).length > 0) {
      const { error: updateError } = await (supabase.from("travel_packages") as any)
        .update(columns)
        .eq("id", id)
        .eq("org_id", user.org_id)

      if (updateError) {
        console.error("Error updating travel package:", updateError)
        return NextResponse.json(
          { error: updateError.message || "Error al editar el paquete" },
          { status: 400 }
        )
      }
    }

    // Reemplazo de las patas. La defensa es la misma de `operation_legs`: el
    // servidor nunca interpreta una lista vacía como "borrá todo" salvo que el
    // cliente lo confirme, porque un bundle viejo puede mandar `items: []` sin
    // haber cargado nunca los ítems reales.
    if (Array.isArray(body.items)) {
      const { count: existingItems } = await (supabase.from("travel_package_items") as any)
        .select("id", { count: "exact", head: true })
        .eq("package_id", id)
        .eq("org_id", user.org_id)

      const wouldWipe = body.items.length === 0 && (existingItems || 0) > 0

      if (wouldWipe && body.items_replace !== true) {
        warnings.push(
          `Se conservaron ${existingItems} ítem(s) del paquete: llegó una lista vacía sin confirmación de reemplazo`
        )
      } else {
        const { error: itemsError } = await (supabase.rpc as any)("replace_travel_package_items", {
          p_package_id: id,
          p_org_id: user.org_id,
          p_items: body.items,
        })
        if (itemsError) {
          const mapped = mapPackageRpcError(itemsError, "PATCH /api/packages/[id] (items)")
          return NextResponse.json(mapped.body, { status: mapped.status })
        }
      }
    }

    const pkg = await fetchPackageById(supabase, user.org_id, id)
    return NextResponse.json({
      success: true,
      package: pkg,
      ...(warnings.length > 0 ? { warnings } : {}),
    })
  } catch (error: any) {
    console.error("Error in PATCH /api/packages/[id]:", error)
    return NextResponse.json({ error: "Error al editar el paquete" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    // Borrar un paquete es del dueño del tenant. `hasAdminRole` y no la lista
    // literal ["ADMIN","SUPER_ADMIN"] que usa el DELETE de operaciones: esa deja
    // afuera a ORG_OWNER, que es el dueño de la agencia.
    if (
      !hasAdminRole((user as any).roles ?? [user.role]) ||
      !canPerformAction(user, "packages", "delete", matrix ?? undefined)
    ) {
      return NextResponse.json({ error: "No tiene permisos para borrar paquetes" }, { status: 403 })
    }

    const { data: existing } = await (supabase.from("travel_packages") as any)
      .select("id")
      .eq("id", id)
      .eq("org_id", user.org_id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 })
    }

    // La FK travel_package_bookings.package_id es RESTRICT, así que la base ya
    // impide borrar un paquete vendido. Este pre-check está para que el usuario
    // reciba una salida ("cerralo") en vez de un 23503 crudo.
    const { count: bookings } = await (supabase.from("travel_package_bookings") as any)
      .select("id", { count: "exact", head: true })
      .eq("package_id", id)
      .eq("org_id", user.org_id)

    if ((bookings || 0) > 0) {
      return NextResponse.json(
        {
          error: `Este paquete tiene ${bookings} venta(s) asociada(s). Cerralo en vez de borrarlo para conservar el historial.`,
        },
        { status: 400 }
      )
    }

    const { error: deleteError } = await (supabase.from("travel_packages") as any)
      .delete()
      .eq("id", id)
      .eq("org_id", user.org_id)

    if (deleteError) {
      console.error("Error deleting travel package:", deleteError)
      // 23503 = FK violation. Solo debería llegar acá si se creó una venta entre
      // el pre-check y el delete.
      if (deleteError.code === "23503") {
        return NextResponse.json(
          { error: "El paquete tiene ventas asociadas y no se puede borrar. Cerralo." },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: "Error al borrar el paquete" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/packages/[id]:", error)
    return NextResponse.json({ error: "Error al borrar el paquete" }, { status: 500 })
  }
}
