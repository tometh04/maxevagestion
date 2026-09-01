import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { todayInArgentina } from "@/lib/utils/date-only"
import {
  esPeriodoValido,
  periodosPendientes,
  puedeCerrar,
} from "@/lib/accounting/accounting-periods"
import { ejecutarCierre } from "@/lib/accounting/monthly-close"

/**
 * Cierre contable mensual, disparado por el contador (VIB-141).
 *
 * Existe además del cron para que nadie dependa de esperar al día configurado.
 * El contador que terminó de revisar el mes lo cierra ahora; el que corrigió una
 * factura recalcula ahora. Ninguno de los dos casos debería requerir que
 * nosotros intervengamos.
 *
 * Las tres acciones responden a tres momentos distintos:
 *
 *   - `calcular`: genera o regenera los ajustes del período. Es idempotente y se
 *     puede repetir todas las veces que haga falta mientras el período esté
 *     abierto.
 *   - `cerrar`: deja el período firme. A partir de ahí no se recalcula sin
 *     reabrirlo, y la reapertura queda registrada con su motivo.
 *   - `reabrir`: vuelve atrás un cierre. Pide motivo a propósito: un período que
 *     se cerró y se volvió a abrir no puede parecer uno que nunca se cerró.
 *
 * Cerrar un período NO bloquea el registro de cobros ni pagos con fecha
 * anterior. Rechazarle un cobro real a un vendedor porque contabilidad cerró el
 * mes rompería la operación diaria de la agencia.
 */
const schema = z.object({
  agencyId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "El período debe tener formato AAAA-MM"),
  action: z.enum(["calcular", "simular", "cerrar", "reabrir"]),
  motivo: z.string().trim().min(3).max(500).optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
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

  if (!canPerformAction(user, "accounting", "write", perms)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    )
  }
  const { agencyId, period, action, motivo } = parsed.data

  if (!esPeriodoValido(period)) {
    return NextResponse.json({ error: "El período no existe" }, { status: 400 })
  }

  // El usuario solo puede tocar las agencias que tiene asignadas. Sin esto, un
  // contable de una sucursal podría cerrarle el mes a otra.
  if (agencyIds.length > 0 && !agencyIds.includes(agencyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: agencia } = await ((supabase as any).from("agencies"))
    .select("id")
    .eq("id", agencyId)
    .eq("org_id", user.org_id)
    .maybeSingle()
  if (!agencia) {
    return NextResponse.json({ error: "La agencia no existe" }, { status: 404 })
  }

  const hoy = todayInArgentina()

  if (action === "calcular" || action === "simular") {
    try {
      const resultado = await ejecutarCierre(supabase as any, {
        orgId: user.org_id,
        agencyId,
        periodo: period,
        hoy,
        userId: user.id,
        simular: action === "simular",
      })
      return NextResponse.json(resultado)
    } catch (e: any) {
      console.error("[accounting/close] error calculando:", e?.message)
      return NextResponse.json({ error: "No se pudo calcular el cierre" }, { status: 500 })
    }
  }

  const { data: actual } = await ((supabase as any).from("accounting_periods"))
    .select("status")
    .eq("org_id", user.org_id)
    .eq("agency_id", agencyId)
    .eq("period", period)
    .maybeSingle()

  if (action === "cerrar") {
    const permitido = puedeCerrar(period, hoy, actual?.status ?? null)
    if (!permitido.puede) {
      return NextResponse.json({ error: permitido.motivo }, { status: 409 })
    }

    const { error } = await ((supabase as any).from("accounting_periods")).upsert(
      {
        org_id: user.org_id,
        agency_id: agencyId,
        period,
        status: "CLOSED",
        closed_at: new Date().toISOString(),
        closed_by: user.id,
      },
      { onConflict: "org_id,agency_id,period" }
    )
    if (error) {
      console.error("[accounting/close] error cerrando:", error.message)
      return NextResponse.json({ error: "No se pudo cerrar el período" }, { status: 500 })
    }
    return NextResponse.json({ period, status: "CLOSED" })
  }

  // reabrir
  if (actual?.status !== "CLOSED") {
    return NextResponse.json({ error: "El período no está cerrado" }, { status: 409 })
  }
  if (!motivo) {
    return NextResponse.json(
      { error: "Hace falta un motivo para reabrir un período cerrado" },
      { status: 400 }
    )
  }

  const { error } = await ((supabase as any).from("accounting_periods"))
    .update({
      status: "OPEN",
      reopened_at: new Date().toISOString(),
      reopened_by: user.id,
      reopen_reason: motivo,
    })
    .eq("org_id", user.org_id)
    .eq("agency_id", agencyId)
    .eq("period", period)

  if (error) {
    console.error("[accounting/close] error reabriendo:", error.message)
    return NextResponse.json({ error: "No se pudo reabrir el período" }, { status: 500 })
  }
  return NextResponse.json({ period, status: "OPEN" })
}

/**
 * GET /api/accounting/close?agencyId=...
 *
 * Los períodos de la agencia, con cuáles quedaron pendientes de calcular. La
 * lista de pendientes sale del mismo cálculo que usa el cron, así que la
 * pantalla no puede mostrar algo distinto de lo que el automático haría.
 */
export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
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

  if (!canPerformAction(user, "accounting", "read", perms)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const agencyId = new URL(request.url).searchParams.get("agencyId")
  if (!agencyId) {
    return NextResponse.json({ error: "Falta agencyId" }, { status: 400 })
  }
  if (agencyIds.length > 0 && !agencyIds.includes(agencyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: settings } = await ((supabase as any).from("financial_settings"))
    .select("accounting_start_date, monthly_close_day, auto_close_month")
    .eq("org_id", user.org_id)
    .eq("agency_id", agencyId)
    .maybeSingle()

  const { data: periodos } = await ((supabase as any).from("accounting_periods"))
    .select("period, status, last_run_at, closed_at, reopened_at, reopen_reason")
    .eq("org_id", user.org_id)
    .eq("agency_id", agencyId)
    .order("period", { ascending: false })

  const filas = (periodos ?? []) as any[]
  const hoy = todayInArgentina()

  return NextResponse.json({
    configurado: Boolean(settings?.accounting_start_date),
    accountingStartDate: settings?.accounting_start_date ?? null,
    monthlyCloseDay: settings?.monthly_close_day ?? 1,
    autoCloseMonth: settings?.auto_close_month ?? false,
    periodos: filas,
    pendientes: periodosPendientes({
      hoy,
      fechaDeInicio: settings?.accounting_start_date ?? null,
      diaDeCierre: settings?.monthly_close_day ?? 1,
      yaCerrados: filas.filter((p) => p.status === "CLOSED").map((p) => p.period),
    }),
  })
}
