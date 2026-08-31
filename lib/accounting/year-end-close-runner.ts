/**
 * Cierre de ejercicio — el proceso que lee, decide y escribe.
 *
 * La aritmética vive en `year-end-close.ts`, que es pura. Acá está lo que toca
 * la base: leer la configuración, verificar que se pueda cerrar, calcular los
 * saldos del ejercicio y escribir los asientos.
 *
 * QUIÉN LO DISPARA
 * ----------------
 * El contador, desde la pantalla, y nadie más. A diferencia del cierre mensual
 * —que corre por cron para mantener los ajustes al día— cerrar un ejercicio es
 * un acto formal: refunde doce meses en una cifra que pasa al patrimonio y deja
 * las cuentas de resultado en cero. Eso no lo decide un proceso automático.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mesesDelEjercicio,
  puedeCerrarEjercicio,
  rangoDelEjercicio,
  type Ejercicio,
} from "./accounting-periods"
import {
  agruparResultadosPorMoneda,
  calcularSaldosPorCuenta,
} from "./chart-account-balances"
import { createJournalEntry, resolveAccountIds } from "./journal-entries"
import { armarCierreDeEjercicio, type CierreDeEjercicio } from "./year-end-close"

/**
 * Los dos tipos de asiento que genera el cierre.
 *
 * Se excluyen del cálculo de saldos: si una corrida anterior ya dejó la
 * refundición, incluirla haría ver las cuentas de resultado en cero y el
 * recálculo no generaría nada.
 */
const TIPOS_DE_CIERRE = ["REFUNDICION", "TRASLADO_RESULTADO"] as const

export interface EjecutarCierreDeEjercicioParams {
  orgId: string
  agencyId: string
  ejercicio: Ejercicio
  hoy: string
  userId?: string | null
  /** Calcula y devuelve el detalle, pero no escribe. */
  simular?: boolean
}

export interface ResultadoCierreDeEjercicio {
  ejercicio: Ejercicio
  /** Por qué no se hizo, si no se hizo. */
  omitido?: string
  /** Meses del ejercicio que siguen abiertos, para poder nombrarlos. */
  mesesAbiertos: string[]
  /** El detalle por moneda, para revisarlo antes de confirmar. */
  cierres: CierreDeEjercicio[]
  asientosCreados: number
  asientosBorrados: number
  desde?: string
  hasta?: string
}

export async function ejecutarCierreDeEjercicio(
  admin: SupabaseClient<any>,
  params: EjecutarCierreDeEjercicioParams
): Promise<ResultadoCierreDeEjercicio> {
  const base: ResultadoCierreDeEjercicio = {
    ejercicio: params.ejercicio,
    mesesAbiertos: [],
    cierres: [],
    asientosCreados: 0,
    asientosBorrados: 0,
  }

  const { data: settings } = await (admin.from("financial_settings") as any)
    .select("accounting_start_date, fiscal_year_end_month")
    .eq("org_id", params.orgId)
    .eq("agency_id", params.agencyId)
    .maybeSingle()

  if (!settings?.accounting_start_date) {
    return { ...base, omitido: "La agencia todavía no configuró su fecha de inicio contable." }
  }

  const mesDeCierre = Number(settings.fiscal_year_end_month) || 12
  const { desde: inicioEjercicio, hasta } = rangoDelEjercicio(params.ejercicio, mesDeCierre)

  // Si la contabilidad arrancó a mitad del ejercicio, el cierre solo puede
  // refundir desde ahí. Tomar el inicio del ejercicio arrastraría movimientos
  // anteriores a la fecha de inicio, que por definición no son de este libro.
  const desde =
    settings.accounting_start_date > inicioEjercicio
      ? settings.accounting_start_date
      : inicioEjercicio

  // ── ¿Se puede cerrar? ────────────────────────────────────────────────
  const meses = mesesDelEjercicio(params.ejercicio, mesDeCierre)
  const { data: periodos } = await (admin.from("accounting_periods") as any)
    .select("period, status")
    .eq("org_id", params.orgId)
    .eq("agency_id", params.agencyId)

  const filas = (periodos ?? []) as any[]
  const mesesCerrados = filas
    .filter((p) => p.status === "CLOSED" && meses.includes(p.period))
    .map((p) => p.period)
  const yaCerrado = filas.some(
    (p) => p.period === String(params.ejercicio) && p.status === "CLOSED"
  )

  const permitido = puedeCerrarEjercicio({
    ejercicio: params.ejercicio,
    hoy: params.hoy,
    mesDeCierre,
    mesesCerrados,
    yaCerrado,
  })
  if (!permitido.puede) {
    return { ...base, omitido: permitido.motivo, mesesAbiertos: permitido.mesesAbiertos, desde, hasta }
  }

  // ── Saldos de las cuentas de resultado del ejercicio ─────────────────
  const saldos = await calcularSaldosPorCuenta(admin, {
    orgId: params.orgId,
    desde,
    hasta,
    // Sin esto, un recálculo vería las cuentas ya canceladas por la corrida
    // anterior y concluiría que el ejercicio no tuvo resultado.
    excluirCloseKinds: [...TIPOS_DE_CIERRE],
  })

  const porMoneda = agruparResultadosPorMoneda(saldos.filas)
  const cierres: CierreDeEjercicio[] = []
  for (const [currency, cuentas] of Array.from(porMoneda.entries())) {
    // La aritmética trabaja con Debe y Haber por código de cuenta; el helper de
    // saldos devuelve además la moneda y el conteo, que acá ya no hacen falta.
    const cierre = armarCierreDeEjercicio(
      cuentas.map((c) => ({
        codigo: c.account_code,
        nombre: c.account_name,
        debe: c.debit,
        haber: c.credit,
      })),
      currency,
      params.ejercicio
    )
    if (cierre) cierres.push(cierre)
  }

  if (params.simular) {
    return { ...base, cierres, desde, hasta }
  }

  // ── Borrar lo de la corrida anterior ─────────────────────────────────
  // La llave es (org, agencia, tipo, fecha del asiento). No se puede usar
  // `close_period` porque va en NULL: el índice único que lo usa es parcial y
  // con dos monedas del mismo tipo habría colisión.
  const { data: previos } = await (admin.from("journal_entries") as any)
    .select("id")
    .eq("org_id", params.orgId)
    .eq("agency_id", params.agencyId)
    .eq("entry_date", hasta)
    .in("close_kind", [...TIPOS_DE_CIERRE])

  const idsPrevios = ((previos ?? []) as any[]).map((r) => r.id)
  if (idsPrevios.length > 0) {
    await (admin.from("ledger_movements") as any).delete().in("journal_entry_id", idsPrevios)
    await (admin.from("journal_entries") as any).delete().in("id", idsPrevios)
  }

  // ── Escribir ─────────────────────────────────────────────────────────
  const codigos = Array.from(
    new Set(cierres.flatMap((c) => c.asientos.flatMap((a) => a.lineas.map((l) => l.codigo))))
  )
  const cuentas = codigos.length > 0 ? await resolveAccountIds(codigos, admin as any, params.orgId) : {}
  const faltantes = codigos.filter((c) => !cuentas[c])
  if (faltantes.length > 0) {
    // Un cierre a medias deja el patrimonio mal para siempre. Se aborta entero.
    return {
      ...base,
      omitido: `Faltan cuentas en el plan: ${faltantes.join(", ")}. No se escribió nada.`,
      cierres,
      asientosBorrados: idsPrevios.length,
      desde,
      hasta,
    }
  }

  let creados = 0
  for (const cierre of cierres) {
    for (const asiento of cierre.asientos) {
      await createJournalEntry(
        {
          entry_date: hasta,
          description:
            asiento.tipo === "REFUNDICION"
              ? `Refundición de resultados del ejercicio ${params.ejercicio} (${cierre.currency})`
              : `Traslado del resultado del ejercicio ${params.ejercicio} a Resultados Acumulados (${cierre.currency})`,
          source: "MANUAL",
          currency: cierre.currency as "ARS" | "USD",
          org_id: params.orgId,
          agency_id: params.agencyId,
          close_kind: asiento.tipo,
          created_by: params.userId ?? null,
          notes: `Ejercicio del ${desde} al ${hasta}. Resultado: ${cierre.resultado} ${cierre.currency}.`,
          lines: asiento.lineas.map((l) => ({
            chart_account_id: cuentas[l.codigo],
            debit_amount: l.debe > 0 ? l.debe : undefined,
            credit_amount: l.haber > 0 ? l.haber : undefined,
            concept: l.detalle,
          })) as any,
        },
        admin as any
      )
      creados += 1
    }
  }

  // ── Dejar el ejercicio cerrado ───────────────────────────────────────
  // A diferencia del cierre mensual, que calcula y deja el período abierto,
  // escribir la refundición ES el acto de cerrar: las cuentas de resultado
  // quedan en cero y el resultado ya pasó al patrimonio. Dejarlo abierto
  // invitaría a recalcular sobre un ejercicio que ya se dio por terminado.
  await (admin.from("accounting_periods") as any).upsert(
    {
      org_id: params.orgId,
      agency_id: params.agencyId,
      period: String(params.ejercicio),
      status: "CLOSED",
      last_run_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
      closed_by: params.userId ?? null,
    },
    { onConflict: "org_id,agency_id,period" }
  )

  return {
    ...base,
    cierres,
    asientosCreados: creados,
    asientosBorrados: idsPrevios.length,
    desde,
    hasta,
  }
}

/**
 * Reabre un ejercicio: borra sus asientos y lo vuelve a marcar abierto.
 *
 * Pide motivo, igual que la reapertura mensual. Un ejercicio que se cerró y se
 * volvió a abrir no puede parecer uno que nunca se cerró: es la diferencia
 * entre corregir y borrar el rastro.
 */
export async function reabrirEjercicio(
  admin: SupabaseClient<any>,
  params: {
    orgId: string
    agencyId: string
    ejercicio: Ejercicio
    motivo: string
    userId?: string | null
  }
): Promise<{ asientosBorrados: number }> {
  const { data: settings } = await (admin.from("financial_settings") as any)
    .select("fiscal_year_end_month")
    .eq("org_id", params.orgId)
    .eq("agency_id", params.agencyId)
    .maybeSingle()

  const { hasta } = rangoDelEjercicio(params.ejercicio, Number(settings?.fiscal_year_end_month) || 12)

  const { data: previos } = await (admin.from("journal_entries") as any)
    .select("id")
    .eq("org_id", params.orgId)
    .eq("agency_id", params.agencyId)
    .eq("entry_date", hasta)
    .in("close_kind", [...TIPOS_DE_CIERRE])

  const ids = ((previos ?? []) as any[]).map((r) => r.id)
  if (ids.length > 0) {
    await (admin.from("ledger_movements") as any).delete().in("journal_entry_id", ids)
    await (admin.from("journal_entries") as any).delete().in("id", ids)
  }

  await (admin.from("accounting_periods") as any)
    .update({
      status: "OPEN",
      reopened_at: new Date().toISOString(),
      reopened_by: params.userId ?? null,
      reopen_reason: params.motivo,
    })
    .eq("org_id", params.orgId)
    .eq("agency_id", params.agencyId)
    .eq("period", String(params.ejercicio))

  return { asientosBorrados: ids.length }
}
