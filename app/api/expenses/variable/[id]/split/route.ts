import { NextResponse } from "next/server"
import { z } from "zod"
import { canPerformAction, getScopedAgenciesForUser } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"
import { logAccountingAction } from "@/lib/accounting/audit"

/**
 * POST /api/expenses/variable/[id]/split
 *
 * Reparte un gasto de agencia entre oficinas. La primera parte se queda en el
 * gasto original; el resto son gastos nuevos, idénticos salvo el importe y la
 * oficina.
 *
 * TODO EL REPARTO LO HACE LA FUNCIÓN `split_agency_expense`
 * --------------------------------------------------------
 * Bajar el importe del movimiento de caja, bajar el de su movimiento del mayor
 * y crear las partes nuevas tiene que pasar todo junto o nada: si se hiciera
 * con llamadas sueltas de PostgREST, un fallo a mitad dejaría el total distinto
 * del original. Por eso la ruta no escribe nada por su cuenta —- valida permisos
 * y alcance, y delega en una sola transacción.
 *
 * La validación del reparto (que las partes sumen exacto, que no se repita una
 * oficina) también vive en la función: es la única que puede mirar el importe
 * bajo lock. `lib/expenses/split-expense.ts` repite las mismas reglas para que
 * el diálogo avise mientras el usuario escribe, pero la que manda es esta.
 */

const SplitSchema = z.object({
  shares: z
    .array(
      z.object({
        agency_id: z.string().uuid("Oficina inválida"),
        amount: z.number().finite().positive(),
      })
    )
    .min(2, "Hay que repartir el gasto entre al menos dos oficinas"),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    // Mismo gate que crear y borrar un gasto: dividir no mueve plata, pero
    // cambia a qué oficina se le imputa y crea filas nuevas.
    if (
      !canPerformAction(user, "accounting", "write", matrix ?? undefined) &&
      !canPerformAction(user, "cash", "write", matrix ?? undefined)
    ) {
      return NextResponse.json({ error: "No tiene permiso para dividir gastos" }, { status: 403 })
    }

    const orgId = (user as any).org_id as string | null
    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const { id } = await params

    const parsed = SplitSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Reparto inválido" },
        { status: 400 }
      )
    }
    const { shares } = parsed.data

    // La función acota las oficinas a la org; acá se acotan además a las que
    // este usuario puede ver, igual que hace el alta. Sin esto, alguien
    // limitado a una oficina podría empujarle gastos a otra.
    const scopedAgencies = await getScopedAgenciesForUser(supabase, user)
    const permitidas = new Set(scopedAgencies.map((a) => a.id))
    if (shares.some((s) => !permitidas.has(s.agency_id))) {
      return NextResponse.json({ error: "La oficina seleccionada no es válida" }, { status: 400 })
    }

    const { data, error } = await (supabase as any).rpc("split_agency_expense", {
      p_movement_id: id,
      p_org_id: orgId,
      p_shares: shares,
      p_actor: user.id,
    })

    if (error) {
      // P0002 = no existe o es de otra org. P0001 = el reparto no se puede
      // aplicar y el mensaje ya está escrito para el usuario.
      if (error.code === "P0002") {
        return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 })
      }
      if (error.code === "P0001") {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      console.error("Error dividiendo el gasto:", error)
      return NextResponse.json({ error: "Error al dividir el gasto" }, { status: 500 })
    }

    const creados: Array<{ ledger_movement_id: string | null; agency_id: string }> =
      data?.created ?? []

    // El asiento es un espejo (affects_balance = false): no mueve saldos y es
    // idempotente por `source_movement_id`, así que se arma después de cerrada
    // la transacción del reparto. Si falla, el gasto ya quedó bien repartido.
    for (const parte of creados) {
      if (!parte.ledger_movement_id) continue
      try {
        const { createMovementJournalEntry, COUNTERPART_CODES } = await import(
          "@/lib/accounting/movement-journal"
        )
        await createMovementJournalEntry(
          {
            movementId: parte.ledger_movement_id,
            counterpartCode: COUNTERPART_CODES.EXPENSE,
            direction: "OUT",
            agencyId: parte.agency_id,
          },
          supabase
        )
      } catch (journalError) {
        console.error("Error asentando la parte del gasto dividido:", journalError)
      }
    }

    logAccountingAction({
      userId: user.id,
      action: "UPDATE_LEDGER",
      entityType: "cash_movement",
      entityId: id,
      details: { motivo: "Gasto dividido entre oficinas", reparto: data },
    })

    // El total no cambió, así que el saldo tampoco; se invalida igual porque
    // las filas que lo componen sí cambiaron.
    const { data: mov } = await (supabase.from("cash_movements") as any)
      .select("financial_account_id")
      .eq("id", id)
      .maybeSingle()
    if (mov?.financial_account_id) {
      await invalidateBalanceCache(mov.financial_account_id)
    }

    return NextResponse.json({ split: data })
  } catch (error: any) {
    console.error("Error in POST /api/expenses/variable/[id]/split:", error)
    return NextResponse.json({ error: "Error al dividir el gasto" }, { status: 500 })
  }
}
