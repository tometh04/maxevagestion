/**
 * Libro Diario — armado de los datos.
 *
 * POR QUÉ EXISTE
 * --------------
 * En Argentina todo comerciante debe llevar Libro Diario, rubricado y foliado,
 * con las operaciones en orden cronológico y sin blancos ni alteraciones.
 * vibook tiene los asientos desde hace unas semanas pero no había forma de
 * sacarlos: el contador podía mirar el mayor en pantalla y nada más.
 *
 * QUÉ HACE Y QUÉ NO
 * -----------------
 * Acá se arma la estructura del libro; el PDF lo dibuja `libro-diario-pdf.ts`.
 * La separación importa porque la numeración correlativa y los totales son lo
 * que un contador revisa, y tienen que poder probarse sin generar un PDF.
 *
 * LA NUMERACIÓN ES DEL LIBRO, NO DE LA BASE
 * -----------------------------------------
 * `journal_entries.entry_number` es un correlativo global de la organización,
 * así que un libro de un mes empezaría en 8.431 y tendría huecos donde hay
 * asientos de otra agencia. Un Libro Diario se numera **desde 1 dentro del
 * libro**, sin saltos. Por eso el folio y el número de asiento se calculan acá
 * y no se leen de la base.
 */

const redondear = (n: number) => Math.round(n * 100) / 100

export interface LineaDelDiario {
  account_code: string
  account_name: string
  debe: number
  haber: number
  concepto: string
}

export interface AsientoDelDiario {
  /** Correlativo dentro del libro, desde 1. No es el de la base. */
  numero: number
  fecha: string
  descripcion: string
  currency: string
  lineas: LineaDelDiario[]
  totalDebe: number
  totalHaber: number
  /** Verdadero si Debe y Haber no coinciden. Se muestra, no se corrige. */
  descuadrado: boolean
}

export interface LibroDiario {
  desde: string
  hasta: string
  asientos: AsientoDelDiario[]
  /** Totales por moneda. Nunca uno solo: sumarlas daría un número inventado. */
  totalesPorMoneda: Record<string, { debe: number; haber: number }>
  /** Cuántos asientos no cuadran. Cero es lo esperable. */
  descuadrados: number
  /**
   * Encabezados sin ninguna línea que se dejaron fuera del libro.
   *
   * Un asiento sin líneas no es un asiento: no tiene importe ni contrapartida.
   * Si se numerara, el libro imprimiría un número con un renglón en blanco, que
   * es justamente lo que la exigencia de llevarlo "sin blancos" prohíbe. Se
   * excluyen antes de numerar, así la correlatividad no queda con huecos.
   *
   * No se ocultan: el número se informa, porque un encabezado huérfano indica
   * que algo se borró a medias y hay que ir a mirarlo.
   */
  vacios: number
}

/** Fila cruda del asiento, tal como viene de la base. */
export interface AsientoCrudo {
  id: string
  entry_date: string
  description: string
  currency: string
  entry_number?: number | null
  lineas: Array<{
    account_code: string
    account_name: string
    debit_amount: number | null
    credit_amount: number | null
    concept?: string | null
  }>
}

/**
 * Ordena, numera y totaliza los asientos de un período.
 *
 * El orden es cronológico estricto y, dentro del mismo día, por el correlativo
 * de la base. Un Libro Diario cuyo orden dependa de cómo vinieron las filas no
 * sirve como libro: la ley pide que las operaciones estén en el orden en que
 * ocurrieron.
 */
export function armarLibroDiario(
  crudos: AsientoCrudo[],
  desde: string,
  hasta: string
): LibroDiario {
  const ordenados = [...crudos].sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date.localeCompare(b.entry_date)
    const na = a.entry_number ?? 0
    const nb = b.entry_number ?? 0
    if (na !== nb) return na - nb
    // Último desempate por id, para que dos corridas del mismo libro devuelvan
    // exactamente el mismo orden. Un libro que cambia entre impresiones no es
    // un libro.
    return a.id.localeCompare(b.id)
  })

  const totalesPorMoneda: Record<string, { debe: number; haber: number }> = {}
  let descuadrados = 0

  // Los encabezados sin líneas quedan afuera ANTES de numerar. Si entraran,
  // consumirían un número y el libro mostraría un renglón en blanco: en
  // producción hay 158 así, residuo de pagos borrados, y en Compañía de Viajes
  // eso hacía que el libro saltara del 41 al 43.
  const conLineas = ordenados.filter((e) => e.lineas.length > 0)
  const vacios = ordenados.length - conLineas.length

  const asientos: AsientoDelDiario[] = conLineas.map((e, i) => {
    const lineas: LineaDelDiario[] = e.lineas.map((l) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      debe: Number(l.debit_amount) || 0,
      haber: Number(l.credit_amount) || 0,
      concepto: l.concept || e.description,
    }))

    // El Debe va antes que el Haber dentro del asiento, que es como se lee un
    // libro. Dentro de cada lado, por código de cuenta.
    lineas.sort((a, b) => {
      const ladoA = a.debe > 0 ? 0 : 1
      const ladoB = b.debe > 0 ? 0 : 1
      if (ladoA !== ladoB) return ladoA - ladoB
      return a.account_code.localeCompare(b.account_code)
    })

    const totalDebe = redondear(lineas.reduce((t, l) => t + l.debe, 0))
    const totalHaber = redondear(lineas.reduce((t, l) => t + l.haber, 0))
    const descuadrado = Math.abs(totalDebe - totalHaber) >= 0.01
    if (descuadrado) descuadrados++

    if (!totalesPorMoneda[e.currency]) totalesPorMoneda[e.currency] = { debe: 0, haber: 0 }
    totalesPorMoneda[e.currency].debe += totalDebe
    totalesPorMoneda[e.currency].haber += totalHaber

    return {
      numero: i + 1,
      fecha: e.entry_date,
      descripcion: e.description,
      currency: e.currency,
      lineas,
      totalDebe,
      totalHaber,
      descuadrado,
    }
  })

  for (const t of Object.values(totalesPorMoneda)) {
    t.debe = redondear(t.debe)
    t.haber = redondear(t.haber)
  }

  return { desde, hasta, asientos, totalesPorMoneda, descuadrados, vacios }
}

/**
 * Cuántas líneas tiene el libro entero.
 *
 * Sirve para decidir si generar el PDF en el request o avisar que el rango es
 * demasiado grande. Medido en producción: un mes ronda los 1.600 asientos y
 * 3.100 líneas; un ejercicio entero de Lozada llega a 19.000 asientos.
 */
export function tamañoDelLibro(libro: LibroDiario): { asientos: number; lineas: number } {
  return {
    asientos: libro.asientos.length,
    lineas: libro.asientos.reduce((t, a) => t + a.lineas.length, 0),
  }
}
