import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { calcularApertura, escribirApertura } from "@/lib/accounting/opening-balances"

/**
 * Asiento de apertura (VIB-141).
 *
 * QUIÉN HACE QUÉ
 * --------------
 * El sistema produce los números: ya sabe cuánta plata hay en cada cuenta,
 * cuánto deben los clientes y cuánto se les debe a los operadores. Lo que
 * ningún software puede hacer es hacerse cargo de que ese sea el punto de
 * partida correcto, y eso sí es del contador.
 *
 * Por eso el GET calcula y muestra, y el POST recién escribe. La confirmación
 * no es un trámite: junto al asiento se listan las operaciones que quedaron
 * afuera por tener importes que no se sostienen, y sin verlas el contador
 * estaría confirmando un número sin saber qué se dejó de lado.
 */

/** GET — calcula la apertura y la devuelve sin escribir nada. */
export async function GET(request: Request) {
  const ctx = await autorizar(request, "read")
  if ("error" in ctx) return ctx.error

  try {
    const apertura = await calcularApertura(ctx.supabase as any, {
      orgId: ctx.orgId,
      agencyId: ctx.agencyId,
      fechaDeInicio: ctx.fechaDeInicio,
    })

    const { data: existentes } = await (ctx.supabase as any)
      .from("journal_entries")
      .select("id, entry_date, currency, total_amount, created_at")
      .eq("org_id", ctx.orgId)
      .eq("agency_id", ctx.agencyId)
      .eq("close_kind", "APERTURA")

    return NextResponse.json({
      configurado: true,
      fechaDeInicio: ctx.fechaDeInicio,
      ...apertura,
      yaGenerado: ((existentes ?? []) as any[]).length > 0,
      existentes: existentes ?? [],
    })
  } catch (e: any) {
    console.error("[accounting/opening-entry] error calculando:", e?.message)
    return NextResponse.json({ error: "No se pudo calcular la apertura" }, { status: 500 })
  }
}

const bodySchema = z.object({
  agencyId: z.string().uuid(),
  /**
   * Confirmación explícita de que se está regenerando algo que ya existe.
   * Obliga a que el reemplazo sea una decisión y no un doble clic.
   */
  reemplazar: z.boolean().optional(),
})

/** POST — escribe el asiento. */
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  const ctx = await autorizar(request, "write", parsed.data.agencyId)
  if ("error" in ctx) return ctx.error

  const { data: existentes } = await (ctx.supabase as any)
    .from("journal_entries")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("agency_id", ctx.agencyId)
    .eq("close_kind", "APERTURA")

  if (((existentes ?? []) as any[]).length > 0 && !parsed.data.reemplazar) {
    return NextResponse.json(
      {
        error:
          "La agencia ya tiene un asiento de apertura. Volvé a intentarlo confirmando que querés reemplazarlo.",
      },
      { status: 409 }
    )
  }

  // Un período ya cerrado se apoya en la apertura: rehacerla por debajo movería
  // saldos que el contador dio por firmes.
  const { data: cerrados } = await (ctx.supabase as any)
    .from("accounting_periods")
    .select("period")
    .eq("org_id", ctx.orgId)
    .eq("agency_id", ctx.agencyId)
    .eq("status", "CLOSED")

  if (((cerrados ?? []) as any[]).length > 0) {
    return NextResponse.json(
      {
        error:
          "Hay períodos cerrados que se apoyan en esta apertura. Reabrilos antes de regenerarla.",
      },
      { status: 409 }
    )
  }

  try {
    const r = await escribirApertura(ctx.supabase as any, {
      orgId: ctx.orgId,
      agencyId: ctx.agencyId,
      fechaDeInicio: ctx.fechaDeInicio,
      userId: ctx.userId,
    })

    if (r.cuentasFaltantes.length > 0) {
      return NextResponse.json(
        {
          error: `Faltan cuentas en el plan: ${r.cuentasFaltantes.join(", ")}. No se escribió nada.`,
        },
        { status: 409 }
      )
    }

    return NextResponse.json(r)
  } catch (e: any) {
    console.error("[accounting/opening-entry] error escribiendo:", e?.message)
    return NextResponse.json({ error: "No se pudo generar la apertura" }, { status: 500 })
  }
}

/** Auth, permisos, scope de agencia y fecha de inicio, que los dos verbos piden igual. */
async function autorizar(
  request: Request,
  accion: "read" | "write",
  agencyIdDelCuerpo?: string
): Promise<
  | { error: NextResponse }
  | {
      supabase: any
      orgId: string
      agencyId: string
      fechaDeInicio: string
      userId: string
    }
> {
  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return {
      error: NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 }),
    }
  }

  const supabase = await createServerClient()
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  const perms = await resolveUserPermissions(
    supabase as any,
    user.id,
    user.org_id,
    (user as any).roles ?? [user.role],
    agencyIds
  )

  if (!canPerformAction(user, "accounting", accion, perms)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  const agencyId =
    agencyIdDelCuerpo ?? new URL(request.url).searchParams.get("agencyId") ?? ""
  if (!agencyId) {
    return { error: NextResponse.json({ error: "Falta agencyId" }, { status: 400 }) }
  }
  if (agencyIds.length > 0 && !agencyIds.includes(agencyId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  const { data: settings } = await (supabase as any)
    .from("financial_settings")
    .select("accounting_start_date")
    .eq("org_id", user.org_id)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (!settings?.accounting_start_date) {
    return {
      error: NextResponse.json(
        {
          configurado: false,
          error: "La agencia todavía no definió desde cuándo lleva contabilidad.",
        },
        { status: 409 }
      ),
    }
  }

  return {
    supabase,
    orgId: user.org_id,
    agencyId,
    fechaDeInicio: settings.accounting_start_date,
    userId: user.id,
  }
}
