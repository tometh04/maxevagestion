/**
 * Saldos de apertura — VIB-141.
 *
 * Junta cómo estaba una agencia el día anterior a su fecha de inicio contable y
 * arma el asiento de apertura. Los números salen de lo operativo, que vibook ya
 * conoce; pedírselos a la agencia sería pedirle que transcriba lo que el sistema
 * tiene.
 *
 * TODO EL HISTÓRICO, A DIFERENCIA DEL CIERRE
 * ------------------------------------------
 * El cierre mensual se acota a partir de la fecha de inicio, para no arrastrar
 * las operaciones importadas con importes poco confiables. La apertura hace lo
 * contrario a propósito: mira TODO lo anterior, porque es justamente el lugar
 * donde eso tiene que entrar. Lo viejo se convierte en un puñado de saldos que
 * el contador revisa y ajusta si hace falta, en vez de colarse operación por
 * operación en los meses siguientes.
 *
 * Esa es la división de trabajo entre los dos: la apertura absorbe la historia,
 * el cierre mantiene el día a día.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAccountBalancesBatch } from "./ledger"
import { recolectarOperaciones } from "./monthly-close"
import {
  armarAsientoDeApertura,
  saldosDesdeOperativo,
  type AsientoDeApertura,
} from "./opening-entry"
import { calcularAnticipoAProveedor, calcularAnticipoDeCliente } from "./advances"
import { esAnticipoCreible, type Anomalia } from "./monthly-close-plan"
import { createJournalEntry, resolveAccountIds } from "./journal-entries"

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Cuentas cuyo saldo sale de las operaciones y no de `financial_accounts`.
 *
 * El sistema mantiene cuentas de control con estos mismos códigos. Tomar el
 * saldo de las dos fuentes duplicaría la deuda de los clientes y la de los
 * operadores. Se elige la operativa porque es la que la agencia ve en pantalla:
 * si el asiento de apertura dijera otra cosa, nadie podría conciliarlo.
 */
const CALCULADAS_DESDE_OPERACIONES = new Set([
  "1.1.03", // Cuentas por Cobrar
  "1.1.06", // Anticipos a Proveedores
  "2.1.01", // Cuentas por Pagar
  "2.1.07", // Anticipos de Clientes
])

/** El día anterior a una fecha 'YYYY-MM-DD'. */
export function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface AperturaParams {
  orgId: string
  agencyId: string
  /** `financial_settings.accounting_start_date`. */
  fechaDeInicio: string
}

export interface Apertura {
  /** El día que retratan los saldos: el anterior al inicio contable. */
  corte: string
  /** Un asiento por moneda. Nunca se mezclan. */
  asientos: AsientoDeApertura[]
  /** Cuentas financieras sin cuenta contable asignada, que quedaron afuera. */
  cuentasSinPlan: string[]
  /** Cuentas de control excluidas a propósito, con el motivo. */
  excluidas: string[]
  /**
   * Operaciones cuyo excedente no se registró por no ser creíble como anticipo.
   * Su contrapartida quedó dentro de Resultados Acumulados; se listan para que
   * el contador pueda revisarlas y ajustar si corresponde.
   */
  anomalias: Anomalia[]
}

/**
 * Calcula la apertura de una agencia. No escribe nada.
 */
export async function calcularApertura(
  admin: SupabaseClient<any>,
  params: AperturaParams
): Promise<Apertura> {
  const corte = diaAnterior(params.fechaDeInicio)

  // ── Cuentas financieras ───────────────────────────────────────────────
  const { data: cuentas } = await (admin.from("financial_accounts") as any)
    .select("id, name, currency, chart_account_id, agency_id")
    .eq("org_id", params.orgId)
    .eq("is_active", true)

  const propias = ((cuentas ?? []) as any[]).filter(
    // Una cuenta sin agencia es de toda la organización; se la considera de la
    // agencia que está abriendo para no dejar plata sin registrar.
    (c) => !c.agency_id || c.agency_id === params.agencyId
  )

  const cuentasSinPlan = propias.filter((c) => !c.chart_account_id).map((c) => c.name)
  const conPlan = propias.filter((c) => c.chart_account_id)

  const saldos =
    conPlan.length > 0
      ? await getAccountBalancesBatch(
          conPlan.map((c) => c.id),
          admin as any,
          corte
        )
      : {}

  const codigosPorId = new Map<string, string>()
  const categoriasPorId = new Map<string, string>()
  const chartIds = Array.from(new Set(conPlan.map((c) => c.chart_account_id)))
  if (chartIds.length > 0) {
    const { data: plan } = await (admin.from("chart_of_accounts") as any)
      .select("id, account_code, category")
      .eq("org_id", params.orgId)
      .in("id", chartIds)
    for (const p of (plan ?? []) as any[]) {
      codigosPorId.set(p.id, p.account_code)
      categoriasPorId.set(p.id, p.category)
    }
  }

  // ── Deudas de clientes y operadores ───────────────────────────────────
  // Se pide desde el principio de los tiempos: la apertura absorbe todo lo
  // anterior a la fecha de inicio.
  const operaciones = await recolectarOperaciones(admin, {
    orgId: params.orgId,
    agencyId: params.agencyId,
    hasta: corte,
    desde: "1900-01-01",
  })

  interface Acumulado {
    cuentasPorCobrar: number
    anticiposDeClientes: number
    cuentasPorPagar: number
    anticiposAProveedores: number
    cuentasFinancieras: Array<{ codigo: string; nombre: string; saldo: number }>
  }
  const porMoneda = new Map<string, Acumulado>()
  const acumulado = (cur: string): Acumulado => {
    if (!porMoneda.has(cur)) {
      porMoneda.set(cur, {
        cuentasPorCobrar: 0,
        anticiposDeClientes: 0,
        cuentasPorPagar: 0,
        anticiposAProveedores: 0,
        cuentasFinancieras: [],
      })
    }
    return porMoneda.get(cur)!
  }

  const excluidas: string[] = []

  for (const c of conPlan) {
    const codigo = codigosPorId.get(c.chart_account_id)
    if (!codigo) continue
    const categoria = categoriasPorId.get(c.chart_account_id)

    // `financial_accounts` no contiene solo cuentas de plata: el sistema crea
    // ahí también cuentas de control ("Cuentas por Cobrar", "Costo de
    // Operadores", "Ganancia Financiera") que no son dinero disponible.
    //
    // Una cuenta de resultado NUNCA puede entrar a un asiento de apertura: los
    // resultados del pasado ya están, por definición, dentro de Resultados
    // Acumulados. Incluirlos los contaría dos veces. En Lozada Rosario eso
    // metía 3.740 millones de "Costo de Operadores" y dejaba el patrimonio
    // inicial en menos 4.227 millones.
    if (categoria === "RESULTADO") {
      excluidas.push(`${c.name} (${codigo}, cuenta de resultado)`)
      continue
    }

    // Y las contrapartidas de clientes y operadores tampoco: esos saldos se
    // calculan desde las operaciones, que es lo que la agencia ve en pantalla.
    // Tomarlos de los dos lados los duplicaría.
    if (CALCULADAS_DESDE_OPERACIONES.has(codigo)) {
      excluidas.push(`${c.name} (${codigo}, se calcula desde las operaciones)`)
      continue
    }

    // El saldo viene firmado según la naturaleza de la cuenta. En un pasivo,
    // "saldo positivo" significa que se debe esa plata, y eso va al Haber.
    const bruto = redondear(saldos[c.id] ?? 0)
    const saldo = categoria === "PASIVO" ? -bruto : bruto

    acumulado(c.currency || "ARS").cuentasFinancieras.push({
      codigo,
      nombre: c.name,
      saldo,
    })
  }

  const anomalias: Anomalia[] = []

  for (const op of operaciones) {
    // Cliente: en la moneda de la venta. Deuda y anticipo son excluyentes.
    const anticipoCliente = calcularAnticipoDeCliente({
      venta: op.ventaDevengada,
      pagadoEnMonedaDeLaDeuda: op.cobrado,
    })
    const acCliente = acumulado(op.currency)

    if (anticipoCliente.tipo) {
      // Mismo criterio que el cierre mensual: un excedente desproporcionado no
      // es un anticipo, es una venta mal cargada. Registrarlo como pasivo
      // declararía una deuda con el cliente que la agencia no tiene.
      //
      // Al no registrarlo, la plata que efectivamente entró sigue estando en
      // las cuentas financieras y la contrapartida cae en Resultados
      // Acumulados, que es exactamente donde corresponde lo que no se puede
      // explicar: ganancia de origen incierto, no un pasivo inventado.
      if (esAnticipoCreible(op.ventaDevengada, op.cobrado)) {
        acCliente.anticiposDeClientes += anticipoCliente.monto
      } else {
        anomalias.push({
          operationId: op.id,
          numero: op.numero,
          motivo:
            op.ventaDevengada < 1
              ? "La operación no tiene importe de venta cargado, pero registra cobros."
              : "Los cobros superan la venta por un margen que no se explica como anticipo.",
          venta: op.ventaDevengada,
          cobrado: op.cobrado,
          currency: op.currency,
        })
      }
    } else {
      acCliente.cuentasPorCobrar += Math.max(0, op.ventaDevengada - op.cobrado)
    }

    // Operador: en la moneda del costo, que puede ser otra.
    const anticipoProveedor = calcularAnticipoAProveedor({
      costo: op.costoComprometido,
      pagadoEnMonedaDeLaDeuda: op.pagadoAOperadores,
    })
    const acOperador = acumulado(op.costCurrency)

    if (anticipoProveedor.tipo) {
      // Espejo del anterior: un pago desproporcionado al operador no es un
      // anticipo, y registrarlo crearía un activo que nadie va a cobrar.
      if (esAnticipoCreible(op.costoComprometido, op.pagadoAOperadores)) {
        acOperador.anticiposAProveedores += anticipoProveedor.monto
      } else {
        anomalias.push({
          operationId: op.id,
          numero: op.numero,
          motivo:
            op.costoComprometido < 1
              ? "La operación no tiene costo de operador cargado, pero registra pagos."
              : "Los pagos al operador superan el costo por un margen que no se explica como anticipo.",
          venta: op.costoComprometido,
          cobrado: op.pagadoAOperadores,
          currency: op.costCurrency,
        })
      }
    } else {
      acOperador.cuentasPorPagar += Math.max(0, op.costoComprometido - op.pagadoAOperadores)
    }
  }

  const asientos: AsientoDeApertura[] = []
  for (const [currency, ac] of Array.from(porMoneda.entries())) {
    const asiento = armarAsientoDeApertura(
      saldosDesdeOperativo({
        cuentasFinancieras: ac.cuentasFinancieras,
        cuentasPorCobrar: redondear(ac.cuentasPorCobrar),
        anticiposDeClientes: redondear(ac.anticiposDeClientes),
        cuentasPorPagar: redondear(ac.cuentasPorPagar),
        anticiposAProveedores: redondear(ac.anticiposAProveedores),
      }),
      currency
    )
    if (asiento) asientos.push(asiento)
  }

  return { corte, asientos, cuentasSinPlan, excluidas, anomalias }
}

export interface ResultadoDeApertura {
  asientosCreados: number
  asientosBorrados: number
  /** Códigos del plan que no se pudieron resolver, si los hubo. */
  cuentasFaltantes: string[]
}

/**
 * Escribe el asiento de apertura de una agencia.
 *
 * Borra la apertura anterior y la vuelve a crear. Regenerar es una operación
 * legítima —el contador puede querer rehacerla después de corregir un saldo— y
 * no se pierde información al hacerlo: el asiento no registra un hecho, retrata
 * un estado que se puede volver a calcular.
 *
 * Lo que NO se puede es regenerarla a ciegas una vez que hay meses cerrados
 * encima. Eso lo decide el llamador, que conoce el estado de los períodos.
 */
export async function escribirApertura(
  admin: SupabaseClient<any>,
  params: AperturaParams & { userId?: string | null }
): Promise<ResultadoDeApertura> {
  const apertura = await calcularApertura(admin, params)

  const { data: previos } = await (admin.from("journal_entries") as any)
    .select("id")
    .eq("org_id", params.orgId)
    .eq("agency_id", params.agencyId)
    .eq("close_kind", "APERTURA")

  const idsPrevios = ((previos ?? []) as any[]).map((r) => r.id)
  if (idsPrevios.length > 0) {
    // Las líneas primero: cuelgan del asiento.
    await (admin.from("ledger_movements") as any).delete().in("journal_entry_id", idsPrevios)
    await (admin.from("journal_entries") as any).delete().in("id", idsPrevios)
  }

  const codigos = Array.from(
    new Set(apertura.asientos.flatMap((a) => a.lineas.map((l) => l.codigo)))
  )
  const cuentas = codigos.length > 0 ? await resolveAccountIds(codigos, admin as any, params.orgId) : {}
  const cuentasFaltantes = codigos.filter((c) => !cuentas[c])

  // Si falta una sola cuenta el asiento no balancea, y un asiento de apertura
  // desbalanceado deja el balance torcido desde el primer día. Se aborta entero
  // en vez de escribir una parte.
  if (cuentasFaltantes.length > 0) {
    return { asientosCreados: 0, asientosBorrados: idsPrevios.length, cuentasFaltantes }
  }

  let creados = 0
  for (const asiento of apertura.asientos) {
    await createJournalEntry(
      {
        entry_date: params.fechaDeInicio,
        description: `Asiento de apertura en ${asiento.currency}`,
        source: "MANUAL",
        currency: asiento.currency as "ARS" | "USD",
        org_id: params.orgId,
        agency_id: params.agencyId,
        close_kind: "APERTURA",
        created_by: params.userId ?? null,
        notes:
          "Saldos al cierre del " +
          apertura.corte +
          ". Generado por el sistema a partir de los saldos operativos.",
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

  return { asientosCreados: creados, asientosBorrados: idsPrevios.length, cuentasFaltantes: [] }
}
