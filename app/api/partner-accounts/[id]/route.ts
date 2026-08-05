import { NextResponse } from "next/server"
import { z } from "zod"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

const patchSchema = z.object({
  profit_percentage: z.coerce.number().min(0).max(100),
})

/** Tolerancia al validar la suma, igual que en distribute-profits. */
const PERCENTAGE_TOLERANCE = 0.01

/**
 * PATCH /api/partner-accounts/[id]
 *
 * Edita la participación en la ganancia de un socio. Hasta VIB-101 el
 * porcentaje solo se podía cargar al crear el socio, así que corregirlo
 * requería SQL directo — y el reporte societario reparte justamente sobre ese
 * número.
 *
 * Avisa, no bloquea, cuando la suma no da 100: editando de a un socio la suma
 * es necesariamente inválida en el medio (bajar A de 60 a 50 antes de subir B
 * de 40 a 50). El gate duro sigue estando donde importa, en
 * `distribute-profits`, que es lo que efectivamente reparte plata.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // `accounting.write` resuelve exactamente a SUPER_ADMIN, ORG_OWNER, ADMIN y
    // CONTABLE: el mismo set que el POST hermano, y respeta los overrides por
    // agencia. Una lista hardcodeada acá se separaría de ese comportamiento.
    const { user, supabase, matrix } = await getRequestPermissions()
    if (!canPerformAction(user, "accounting", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado para editar socios" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      )
    }
    const orgId = (user as any).org_id as string
    const { id } = await params

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "El porcentaje debe estar entre 0 y 100" },
        { status: 400 }
      )
    }
    const profitPercentage = parsed.data.profit_percentage

    // Lectura scopeada antes del write. 404 y no 403: confirmar que la fila
    // existe en otro tenant ya es información.
    const { data: existing } = await (supabase.from("partner_accounts") as any)
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 })
    }

    const { data: partner, error } = await (supabase.from("partner_accounts") as any)
      .update({ profit_percentage: profitPercentage })
      .eq("id", id)
      // Defensa en profundidad: el scope va también en el UPDATE.
      .eq("org_id", orgId)
      .select()
      .single()

    if (error) {
      console.error("[PartnerAccounts API] Error updating partner:", error)
      return NextResponse.json({ error: "Error al actualizar el socio" }, { status: 500 })
    }

    // Suma resultante de los socios activos, para que la UI pueda avisar sin
    // pedir de nuevo la lista.
    const { data: activos } = await (supabase.from("partner_accounts") as any)
      .select("id, profit_percentage")
      .eq("org_id", orgId)
      .eq("is_active", true)

    const percentageSum = (activos || []).reduce(
      (acc: number, p: any) =>
        acc + (p.id === id ? profitPercentage : Number(p.profit_percentage) || 0),
      0
    )

    return NextResponse.json({
      partner,
      percentageSum: Math.round(percentageSum * 100) / 100,
      percentageValid: Math.abs(percentageSum - 100) <= PERCENTAGE_TOLERANCE,
    })
  } catch (error: any) {
    console.error("Error in PATCH /api/partner-accounts/[id]:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
