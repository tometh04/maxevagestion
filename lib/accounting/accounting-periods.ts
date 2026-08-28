/**
 * Períodos contables — VIB-141.
 *
 * QUÉ PROBLEMA RESUELVE
 * ---------------------
 * Los ajustes contables que faltaban (anticipos, ventas sin facturar, facturas
 * a recibir, revaluación) son asientos de CIERRE: no nacen de un hecho puntual,
 * se calculan mirando cómo quedó el negocio al último día del mes. Para eso
 * hace falta saber a qué mes pertenece cada ajuste y si ese mes todavía admite
 * recálculo.
 *
 * POR QUÉ ES TODO PURO
 * --------------------
 * Acá no hay acceso a base de datos a propósito. La regla de "qué períodos
 * corresponde cerrar hoy" es la que decide si el cron toca o no toca la
 * contabilidad de una agencia: tiene que poder probarse contra fechas
 * incómodas (día 31 en febrero, agencia que activó el automático seis meses
 * tarde, cron que no corrió una semana) sin levantar nada.
 *
 * EL PRINCIPIO QUE ORDENA EL DISEÑO
 * ---------------------------------
 * El cierre tiene que poder recuperarse solo. Si el cron falla tres días, si la
 * agencia prende el automático en marzo con la contabilidad arrancada en enero,
 * o si alguien lo apaga y lo vuelve a prender, el sistema tiene que ponerse al
 * día sin que nadie corra nada a mano. Por eso `periodosPendientes` no pregunta
 * "¿hoy es el día de cierre?" sino "¿qué períodos deberían estar cerrados y no
 * lo están?".
 */

/** Un período es un mes calendario, identificado como 'YYYY-MM'. */
export type Periodo = string

export type EstadoPeriodo = "OPEN" | "CLOSED"

const FORMATO = /^\d{4}-\d{2}$/

export function esPeriodoValido(p: string): boolean {
  if (!FORMATO.test(p)) return false
  const mes = Number(p.slice(5, 7))
  return mes >= 1 && mes <= 12
}

/** El período al que pertenece una fecha 'YYYY-MM-DD'. */
export function periodoDe(fecha: string): Periodo {
  return fecha.slice(0, 7)
}

/** Primer y último día del período, ambos inclusive. */
export function rangoDelPeriodo(periodo: Periodo): { desde: string; hasta: string } {
  const year = Number(periodo.slice(0, 4))
  const month = Number(periodo.slice(5, 7))
  // Día 0 del mes siguiente = último día de este mes. Cubre los bisiestos sin
  // tabla de días por mes.
  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    desde: `${periodo}-01`,
    hasta: `${periodo}-${String(ultimoDia).padStart(2, "0")}`,
  }
}

export function periodoSiguiente(periodo: Periodo): Periodo {
  const year = Number(periodo.slice(0, 4))
  const month = Number(periodo.slice(5, 7))
  const y = month === 12 ? year + 1 : year
  const m = month === 12 ? 1 : month + 1
  return `${y}-${String(m).padStart(2, "0")}`
}

export function periodoAnterior(periodo: Periodo): Periodo {
  const year = Number(periodo.slice(0, 4))
  const month = Number(periodo.slice(5, 7))
  const y = month === 1 ? year - 1 : year
  const m = month === 1 ? 12 : month - 1
  return `${y}-${String(m).padStart(2, "0")}`
}

/**
 * El día en que corresponde cerrar un período, según la configuración de la
 * agencia.
 *
 * El cierre de un mes ocurre en el mes SIGUIENTE: no se puede cerrar septiembre
 * el 30 de septiembre a la mañana, porque todavía queda el día. Un
 * `monthly_close_day` de 5 significa "el 5 de octubre cierro septiembre".
 *
 * Si el día configurado no existe en el mes en que hay que cerrar (31 en
 * febrero), se usa el último día de ese mes. La alternativa —pasar al 1 del mes
 * siguiente— retrasaría el cierre un mes entero.
 */
export function fechaDeCierre(periodo: Periodo, diaDeCierre: number): string {
  const siguiente = periodoSiguiente(periodo)
  const { hasta } = rangoDelPeriodo(siguiente)
  const ultimoDiaDelSiguiente = Number(hasta.slice(8, 10))
  const dia = Math.min(Math.max(diaDeCierre, 1), ultimoDiaDelSiguiente)
  return `${siguiente}-${String(dia).padStart(2, "0")}`
}

export interface PendientesParams {
  /** Hoy, 'YYYY-MM-DD'. */
  hoy: string
  /** `financial_settings.accounting_start_date`. Sin esto no hay contabilidad. */
  fechaDeInicio: string | null
  /** `financial_settings.monthly_close_day`. */
  diaDeCierre: number
  /** Períodos que ya están cerrados para esta agencia. */
  yaCerrados: Periodo[]
  /**
   * Tope de períodos a devolver por corrida. Existe para que una agencia con
   * dos años de atraso no dispare doscientos cierres en un solo cron: se pone
   * al día de a poco, sin que nadie tenga que intervenir.
   */
  maximo?: number
}

/**
 * Los períodos que deberían estar cerrados hoy y todavía no lo están.
 *
 * Devuelve una lista, no un booleano, justamente para que el sistema se ponga
 * al día solo. Si el cron no corrió, si la agencia activó el automático tarde o
 * si alguien lo apagó un tiempo, la próxima corrida recupera todo lo que quedó
 * atrás sin que haga falta un script.
 *
 * Nunca devuelve el período en curso: un mes que todavía no terminó no se
 * cierra, y su fecha de cierre siempre cae en el futuro.
 */
export function periodosPendientes(p: PendientesParams): Periodo[] {
  if (!p.fechaDeInicio) return []

  const cerrados = new Set(p.yaCerrados)
  const pendientes: Periodo[] = []
  const maximo = p.maximo ?? 12

  let periodo = periodoDe(p.fechaDeInicio)
  const periodoActual = periodoDe(p.hoy)

  // Cota dura de iteraciones: protege de una fecha de inicio absurda (año 1900
  // cargado a mano) sin depender de que el llamador pase un máximo sensato.
  for (let i = 0; i < 600 && periodo <= periodoActual; i++) {
    if (!cerrados.has(periodo) && fechaDeCierre(periodo, p.diaDeCierre) <= p.hoy) {
      pendientes.push(periodo)
      if (pendientes.length >= maximo) break
    }
    periodo = periodoSiguiente(periodo)
  }

  return pendientes
}

/**
 * Si se pueden recalcular los ajustes de un período.
 *
 * Mientras está abierto, sí: un contable que corrige una factura el día 3 tiene
 * que poder regenerar el ajuste sin pedirle nada a nadie. Una vez cerrado, no:
 * ahí está el valor de cerrar. Para tocarlo hay que reabrirlo explícitamente, y
 * esa reapertura queda registrada.
 */
export function puedeRecalcular(estado: EstadoPeriodo | null): boolean {
  return estado !== "CLOSED"
}

/**
 * Si un período puede cerrarse a la fecha dada.
 *
 * No se cierra un mes que todavía no terminó, ni uno ya cerrado. Se comprueba
 * contra el fin del período y no contra el día configurado: un cierre manual
 * anticipado es legítimo (el contador terminó antes), cerrar un mes en curso no.
 */
export function puedeCerrar(
  periodo: Periodo,
  hoy: string,
  estado: EstadoPeriodo | null
): { puede: boolean; motivo?: string } {
  if (!esPeriodoValido(periodo)) {
    return { puede: false, motivo: "El período no tiene formato AAAA-MM." }
  }
  if (estado === "CLOSED") {
    return { puede: false, motivo: "El período ya está cerrado. Hay que reabrirlo para modificarlo." }
  }
  if (rangoDelPeriodo(periodo).hasta >= hoy) {
    return { puede: false, motivo: "El período todavía no terminó." }
  }
  return { puede: true }
}
