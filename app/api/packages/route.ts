import { NextResponse } from "next/server"
import { z } from "zod"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { fetchPackagesWithAvailability } from "@/lib/packages/queries"
import { mapPackageRpcError } from "@/lib/packages/errors"

// Usa cookies para autenticación.
export const dynamic = "force-dynamic"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const itemSchema = z.object({
  operator_id: z.string().uuid("Operador inválido"),
  product_type: z.string().trim().max(60).optional().nullable(),
  cost: z.coerce.number().min(0, "El costo no puede ser negativo").default(0),
  cost_currency: z.enum(["ARS", "USD"]).default("USD"),
  sale_amount: z.coerce.number().min(0, "La venta no puede ser negativa").default(0),
  notes: z.string().trim().max(500).optional().nullable(),
})

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  destination: z.string().trim().max(200).optional().nullable(),
  departure_date: z.string().regex(DATE_ONLY, "Fecha inválida").optional().nullable(),
  return_date: z.string().regex(DATE_ONLY, "Fecha inválida").optional().nullable(),
  total_quota: z.coerce.number().int("El cupo debe ser un número entero").min(0, "El cupo no puede ser negativo"),
  sale_amount_total: z.coerce.number().min(0).optional().nullable(),
  sale_currency: z.enum(["ARS", "USD"]).default("USD"),
  agency_id: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z.array(itemSchema).default([]),
})

export async function GET(request: Request) {
  try {
    const { user, supabase, agencyIds, matrix } = await getRequestPermissions()

    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "packages", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "No tiene permisos para ver paquetes" }, { status: 403 })
    }

    // selector=true: lo consume el alta de operación. Devuelve solo lo que se
    // puede vender hoy (ACTIVE y con plazas libres) para que el vendedor no
    // elija un paquete que va a rebotar al guardar.
    const { searchParams } = new URL(request.url)
    const isSelector = searchParams.get("selector") === "true"

    const packages = await fetchPackagesWithAvailability(supabase, {
      orgId: user.org_id,
      agencyIds,
      onlySellable: isSelector,
    })

    return NextResponse.json({ packages })
  } catch (error: any) {
    console.error("Error in GET /api/packages:", error)
    return NextResponse.json({ error: "Error al obtener paquetes" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "packages", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "No tiene permisos para crear paquetes" }, { status: 403 })
    }

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      )
    }
    const body = parsed.data

    if (body.departure_date && body.return_date && body.return_date < body.departure_date) {
      return NextResponse.json(
        { error: "La fecha de regreso no puede ser anterior a la de salida" },
        { status: 400 }
      )
    }

    // La agencia tiene que ser de la misma org: no alcanza con RLS, el body la
    // trae el cliente.
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

    const { data: created, error: createError } = await (supabase.from("travel_packages") as any)
      .insert({
        org_id: user.org_id,
        agency_id: body.agency_id || null,
        name: body.name,
        description: body.description || null,
        destination: body.destination || null,
        departure_date: body.departure_date || null,
        return_date: body.return_date || null,
        total_quota: body.total_quota,
        sale_amount_total: body.sale_amount_total ?? null,
        sale_currency: body.sale_currency,
        notes: body.notes || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (createError || !created) {
      console.error("Error creating travel package:", createError)
      return NextResponse.json(
        { error: createError?.message || "Error al crear el paquete" },
        { status: 400 }
      )
    }

    if (body.items.length > 0) {
      const { error: itemsError } = await (supabase.rpc as any)("replace_travel_package_items", {
        p_package_id: created.id,
        p_org_id: user.org_id,
        p_items: body.items,
      })

      if (itemsError) {
        // Un paquete sin patas no sirve para nada y es una trampa esperando a que
        // alguien lo venda. Se deshace el alta entera: todavía no hay nada
        // colgando de él (el cupo no se puede tomar hasta que exista una venta).
        await (supabase.from("travel_packages") as any)
          .delete()
          .eq("id", created.id)
          .eq("org_id", user.org_id)

        const mapped = mapPackageRpcError(itemsError, "POST /api/packages (items)")
        return NextResponse.json(mapped.body, { status: mapped.status })
      }
    }

    return NextResponse.json({ success: true, id: created.id }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/packages:", error)
    return NextResponse.json({ error: "Error al crear el paquete" }, { status: 500 })
  }
}
