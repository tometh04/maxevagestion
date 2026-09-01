import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { todayInArgentina } from "@/lib/utils/date-only"
import { ejercicioDe, mesesDelEjercicio, rangoDelEjercicio } from "@/lib/accounting/accounting-periods"
import {
  ejecutarCierreDeEjercicio,
  reabrirEjercicio,
} from "@/lib/accounting/year-end-close-runner"

/**
 * Cierre de ejercicio anual.
 *
 * A diferencia del cierre mensual, que corre por cron para mantener los ajustes
 * al día, este lo dispara siempre una persona. Refundir doce meses en una cifra
 * que pasa al patrimonio es un acto formal, no algo que un proceso automático
 * deba decidir.
 *
 * `simular` calcula y devuelve el detalle sin escribir. Es el paso que el
 * contador mira antes de confirmar: cuánto dio el ejercicio en cada moneda y
 * qué cuentas se van a cancelar.
 */
const schema = z.object({
  agencyId: z.string().uuid(),
  ejercicio: z.number().int().min(2000).max(2100),
  action: z.enum(["simular", "cerrar", "reabrir"]),
  motivo: z.string().trim().min(3).max(500).optional(),
})

export async function POST(request: Request) {
  const ctx = await autorizar(request, "write")
  if ("error" in ctx) return ctx.error

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    )
  }
  const { agencyId, ejercicio, action, motivo } = parsed.data

  if (!ctx.puedeVerAgencia(agencyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    if (action === "reabrir") {
      if (!motivo) {
        return NextResponse.json(
          { error: "Hace falta un motivo para reabrir un ejercicio cerrado" },
          { status: 400 }
        )
      }
      const r = await reabrirEjercicio(ctx.supabase as any, {
        orgId: ctx.orgId,
        agencyId,
        ejercicio,
        motivo,
        userId: ctx.userId,
      })
      return NextResponse.json({ ejercicio, status: "OPEN", ...r })
    }

    const r = await ejecutarCierreDeEjercicio(ctx.supabase as any, {
      orgId: ctx.orgId,
      agencyId,
      ejercicio,
      hoy: todayInArgentina(),
      userId: ctx.userId,
      simular: action === "simular",
    })

    // Un cierre que no se puede hacer no es un error del servidor: es una
    // condición que el contador tiene que resolver (meses abiertos, cuentas
    // faltantes). Se devuelve 409 con el motivo y los meses, para que la
    // pantalla pueda nombrarlos.
    if (r.omitido && action === "cerrar") {
      return NextResponse.json({ error: r.omitido, mesesAbiertos: r.mesesAbiertos }, { status: 409 })
    }

    return NextResponse.json(r)
  } catch (e: any) {
    console.error("[accounting/year-end-close] error:", e?.message)
    return NextResponse.json({ error: "No se pudo procesar el cierre de ejercicio" }, { status: 500 })
  }
}

/**
 * GET — qué ejercicios hay para cerrar y en qué estado están.
 *
 * Se derivan de la fecha de inicio contable, no de una tabla: un ejercicio
 * existe porque hubo actividad en él, y listar solo los que ya se tocaron
 * dejaría invisible el primero.
 */
export async function GET(request: Request) {
  const ctx = await autorizar(request, "read")
  if ("error" in ctx) return ctx.error

  const agencyId = new URL(request.url).searchParams.get("agencyId")
  if (!agencyId) return NextResponse.json({ error: "Falta agencyId" }, { status: 400 })
  if (!ctx.puedeVerAgencia(agencyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: settings } = await (ctx.supabase as any)
    .from("financial_settings")
    .select("accounting_start_date, fiscal_year_end_month")
    .eq("org_id", ctx.orgId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (!settings?.accounting_start_date) {
    return NextResponse.json({ configurado: false, ejercicios: [] })
  }

  const mesDeCierre = Number(settings.fiscal_year_end_month) || 12
  const hoy = todayInArgentina()
  const primero = ejercicioDe(settings.accounting_start_date, mesDeCierre)
  const actual = ejercicioDe(hoy, mesDeCierre)

  const { data: periodos } = await (ctx.supabase as any)
    .from("accounting_periods")
    .select("period, status, closed_at, reopened_at, reopen_reason")
    .eq("org_id", ctx.orgId)
    .eq("agency_id", agencyId)

  const filas = (periodos ?? []) as any[]
  const porPeriodo = new Map(filas.map((p) => [p.period, p]))

  const ejercicios = []
  // Solo los ejercicios YA TERMINADOS: el que está en curso no se cierra.
  for (let e = primero; e < actual; e++) {
    const { desde, hasta } = rangoDelEjercicio(e, mesDeCierre)
    const meses = mesesDelEjercicio(e, mesDeCierre)
    const abiertos = meses.filter((m) => porPeriodo.get(m)?.status !== "CLOSED")
    const fila = porPeriodo.get(String(e))

    ejercicios.push({
      ejercicio: e,
      desde,
      hasta,
      status: fila?.status === "CLOSED" ? "CLOSED" : "OPEN",
      closedAt: fila?.closed_at ?? null,
      reopenedAt: fila?.reopened_at ?? null,
      reopenReason: fila?.reopen_reason ?? null,
      mesesAbiertos: abiertos,
    })
  }

  return NextResponse.json({
    configurado: true,
    fiscalYearEndMonth: mesDeCierre,
    accountingStartDate: settings.accounting_start_date,
    ejercicios: ejercicios.reverse(),
  })
}

/** Auth, permisos y scope de agencia, que los dos verbos piden igual. */
async function autorizar(
  request: Request,
  accion: "read" | "write"
): Promise<
  | { error: NextResponse }
  | {
      supabase: any
      orgId: string
      userId: string
      puedeVerAgencia: (id: string) => boolean
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

  return {
    supabase,
    orgId: user.org_id,
    userId: user.id,
    // Un usuario sin agencias asignadas ve todas las de su organización, que es
    // el criterio que ya aplican el resto de las pantallas contables.
    puedeVerAgencia: (id: string) => agencyIds.length === 0 || agencyIds.includes(id),
  }
}
