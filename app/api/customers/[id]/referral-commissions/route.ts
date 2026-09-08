import { NextResponse } from "next/server"
import { z } from "zod"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { findOperationsMissingReferralCommission } from "@/lib/referrals/pending-operations"
import { createOrUpdateReferralCommission } from "@/lib/referrals/calculate"

export const dynamic = "force-dynamic"

/**
 * Ventas de un cliente que quedaron sin comisión de referido, y alta de esas
 * comisiones a pedido.
 *
 * Existe porque el referidor se carga en el CLIENTE y la comisión se calcula al
 * guardar la VENTA: si el referidor se marca después, las ventas ya cargadas no
 * generan nada. Esto deja completarlas eligiendo cuáles, en vez de hacerlo solo
 * (marcar como referido a un cliente viejo le generaría comisiones al referidor
 * por ventas que no trajo).
 *
 * Gate: módulo `referrals`, igual que el resto de las pantallas de referidos.
 * Lectura para ver la lista, escritura para generarlas.
 */

const applySchema = z.object({
  operationIds: z.array(z.string().uuid()).min(1).max(100),
})

/**
 * El cliente tiene que ser del tenant de quien pregunta. Scope explícito, no
 * solo RLS: sin esto un id de otra organización devolvería el nombre de su
 * referidor aunque la lista de ventas viniera vacía.
 */
async function customerBelongsToOrg(
  supabase: any,
  customerId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("org_id", orgId)
    .maybeSingle()
  return !!data
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const { user, supabase, agencyIds, matrix } = await getRequestPermissions()

    if (!(user as any)?.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "referrals", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!(await customerBelongsToOrg(supabase, customerId, (user as any).org_id))) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    const result = await findOperationsMissingReferralCommission({
      supabase,
      customerId,
      orgId: (user as any).org_id,
      agencyIds,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error en GET /api/customers/[id]/referral-commissions:", error)
    return NextResponse.json(
      { error: "Error al buscar las ventas sin comisión de referido" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const { user, supabase, agencyIds, matrix } = await getRequestPermissions()

    if (!(user as any)?.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "referrals", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!(await customerBelongsToOrg(supabase, customerId, (user as any).org_id))) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    const parsed = applySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Elegí al menos una venta para generar la comisión" },
        { status: 400 }
      )
    }

    // Se vuelve a resolver la lista en el servidor y se intersecta con lo que
    // pidió el cliente: así no se puede generar una comisión sobre una venta de
    // otra oficina, ya comisionada, o de otro cliente, mandando ids a mano.
    const { referral, operations } = await findOperationsMissingReferralCommission({
      supabase,
      customerId,
      orgId: (user as any).org_id,
      agencyIds,
    })

    if (!referral.partnerId) {
      return NextResponse.json(
        { error: "El cliente no tiene un referidor asignado" },
        { status: 400 }
      )
    }

    const requested = new Set(parsed.data.operationIds)
    const eligible = operations.filter((op) => requested.has(op.operationId))

    if (eligible.length === 0) {
      return NextResponse.json(
        { error: "Ninguna de las ventas elegidas está pendiente de comisión de referido" },
        { status: 409 }
      )
    }

    const created: string[] = []
    const failed: string[] = []

    for (const op of eligible) {
      // Misma función que corre al guardar la venta: la comisión queda idéntica
      // a la que se habría generado si el referidor hubiera estado cargado.
      const result = await createOrUpdateReferralCommission({
        supabase,
        operationId: op.operationId,
        customerId,
        marginAmount: op.marginAmount,
        orgId: (user as any).org_id,
        agencyId: op.agencyId,
        currency: op.currency,
        operationDate: op.operationDate,
      })

      if (result.status === "created" || result.status === "updated") created.push(op.operationId)
      else {
        console.error(
          `[Referrals] No se pudo generar la comisión de la operación ${op.operationId}: ${result.reason ?? result.status}`
        )
        failed.push(op.operationId)
      }
    }

    return NextResponse.json({
      created: created.length,
      failed: failed.length,
      partnerName: referral.partnerName,
    })
  } catch (error: any) {
    console.error("Error en POST /api/customers/[id]/referral-commissions:", error)
    return NextResponse.json(
      { error: "Error al generar las comisiones de referido" },
      { status: 500 }
    )
  }
}
