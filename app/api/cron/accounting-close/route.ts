import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { todayInArgentina } from "@/lib/utils/date-only"
import { periodosPendientes } from "@/lib/accounting/accounting-periods"
import { ejecutarCierre, type ResultadoDeCierre } from "@/lib/accounting/monthly-close"

/**
 * POST /api/cron/accounting-close
 *
 * Cierre contable mensual automático (VIB-141).
 *
 * QUÉ HACE Y POR QUÉ CORRE TODOS LOS DÍAS
 * ---------------------------------------
 * Recorre las agencias que pidieron cierre automático y genera los asientos de
 * ajuste de los períodos que ya deberían estar cerrados. Corre a diario y no el
 * día de cierre de cada agencia porque cada una elige su propio día: preguntar
 * "¿a quién le toca hoy?" es más simple y más robusto que programar un cron por
 * agencia.
 *
 * SE PONE AL DÍA SOLO
 * -------------------
 * `periodosPendientes` no contesta "¿hoy es el día de cierre?" sino "¿qué
 * períodos deberían estar cerrados y no lo están?". Si el cron no corre unos
 * días, si una agencia activa el automático seis meses tarde o si alguien lo
 * apaga y lo vuelve a prender, la próxima corrida recupera lo que quedó atrás.
 * Nadie tiene que ejecutar nada a mano para arreglarlo.
 *
 * QUÉ NO HACE
 * -----------
 * No cierra los períodos: los calcula y los deja ABIERTOS. Cerrar es una
 * decisión del contador —significa "esto queda firme"— y no algo que un proceso
 * automático deba decidir por él. El cron mantiene los ajustes al día; el
 * contador cierra cuando revisó.
 *
 * Una agencia sin `accounting_start_date` se saltea. Es el estado de todas hoy,
 * así que este cron es inofensivo hasta que alguien configure su contabilidad.
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function POST(request: Request) {
  const auth = checkCronAuth(request, "accounting-close")
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const hoy = todayInArgentina()

  const { data: settings, error } = await admin
    .from("financial_settings")
    .select("org_id, agency_id, accounting_start_date, monthly_close_day, auto_close_month")
    .eq("auto_close_month", true)
    .not("accounting_start_date", "is", null)

  if (error) {
    console.error("[cron:accounting-close] no se pudo leer la configuración:", error.message)
    return NextResponse.json({ error: "Error leyendo configuración" }, { status: 500 })
  }

  const agencias = (settings ?? []) as any[]
  const resultados: ResultadoDeCierre[] = []
  const fallidas: Array<{ agencyId: string; periodo: string; error: string }> = []

  for (const s of agencias) {
    if (!s.org_id || !s.agency_id) continue

    const { data: cerrados } = await admin
      .from("accounting_periods")
      .select("period")
      .eq("org_id", s.org_id)
      .eq("agency_id", s.agency_id)
      .eq("status", "CLOSED")

    const pendientes = periodosPendientes({
      hoy,
      fechaDeInicio: s.accounting_start_date,
      diaDeCierre: s.monthly_close_day ?? 1,
      yaCerrados: ((cerrados ?? []) as any[]).map((r) => r.period),
    })

    for (const periodo of pendientes) {
      try {
        const r = await ejecutarCierre(admin, {
          orgId: s.org_id,
          agencyId: s.agency_id,
          periodo,
          hoy,
          userId: null,
        })
        resultados.push(r)
      } catch (e: any) {
        // Una agencia que falla no puede frenar a las demás: son tenants
        // distintos y no comparten nada.
        console.error(
          `[cron:accounting-close] falló ${s.agency_id} período ${periodo}:`,
          e?.message
        )
        fallidas.push({ agencyId: s.agency_id, periodo, error: e?.message ?? "desconocido" })
      }
    }
  }

  const asientos = resultados.reduce((t, r) => t + r.asientosCreados, 0)
  const anomalias = resultados.reduce((t, r) => t + r.anomalias.length, 0)

  console.log(
    `[cron:accounting-close] ${hoy} — ${agencias.length} agencias con cierre automático, ` +
      `${resultados.length} períodos procesados, ${asientos} asientos, ` +
      `${anomalias} datos a revisar, ${fallidas.length} fallas`
  )

  return NextResponse.json({
    fecha: hoy,
    agenciasConfiguradas: agencias.length,
    periodosProcesados: resultados.length,
    asientosCreados: asientos,
    datosARevisar: anomalias,
    fallidas,
    detalle: resultados,
  })
}
