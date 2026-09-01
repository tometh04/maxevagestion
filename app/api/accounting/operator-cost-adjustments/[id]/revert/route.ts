/**
 * Revertir un ajuste de liquidación (VIB-174).
 *
 * No borra nada del mayor: un asiento emitido no se deshace, se contra-asienta.
 * Sí borra las comisiones de corrección que todavía nadie tocó; si alguna ya se
 * liquidó, la función corta antes de escribir y hay que revertir ese pago
 * primero desde Comisiones.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

const bodySchema = z.object({
  reason: z.string().trim().min(1, "El motivo de la reversión es obligatorio").max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any).org_id

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "accounting", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Datos inválidos" },
        { status: 400 },
      )
    }

    const { data, error } = await (supabase.rpc as any)("revert_operator_cost_adjustment", {
      p_adjustment_id: id,
      p_org_id: orgId,
      p_reason: parsed.data.reason,
      p_actor: (user as any).id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[VIB-174] Error al revertir el ajuste:", error)
    return NextResponse.json(
      { error: error?.message || "Error al revertir el ajuste" },
      { status: 500 },
    )
  }
}
