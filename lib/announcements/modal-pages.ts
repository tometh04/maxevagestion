/**
 * Divide el texto de una novedad en las páginas del modal.
 *
 * El criterio: una línea con `---` separa páginas, y la primera línea de cada
 * página es su título.
 *
 * Va por convención sobre el texto y no en una columna aparte por tres motivos:
 * el mismo texto tiene que seguir sirviendo para la campana, `--body-file` no
 * cambia, y una novedad que hoy existe se sigue viendo igual. Sin separadores
 * hay una sola página y el comportamiento es exactamente el de antes.
 *
 * Paginar no es lo contrario de ser breve: es lo que permite dar más
 * información sin el muro de texto. Cuatro páginas de cuarenta palabras se leen
 * en menos tiempo que un bloque de cuatrocientas.
 */

export interface PaginaDelModal {
  /** Encabezado de la página. Null cuando el texto no está paginado. */
  titulo: string | null
  /** El resto del texto de esa página. */
  cuerpo: string
}

const SEPARADOR = /^[ \t]*---[ \t]*$/

export function partirEnPaginas(texto: string): PaginaDelModal[] {
  const limpio = (texto ?? "").replace(/\r\n/g, "\n")
  const bloques = limpio
    .split("\n")
    .reduce<string[][]>(
      (acc, linea) => {
        if (SEPARADOR.test(linea)) acc.push([])
        else acc[acc.length - 1].push(linea)
        return acc
      },
      [[]]
    )
    .map((lineas) => lineas.join("\n").trim())
    .filter((b) => b.length > 0)

  if (bloques.length === 0) return []

  // Sin separadores no se toca nada: una novedad vieja se sigue viendo igual, y
  // su primera línea no se convierte en un título que nadie escribió como tal.
  if (bloques.length === 1) {
    return [{ titulo: null, cuerpo: bloques[0] }]
  }

  return bloques.map((bloque) => {
    const [primera, ...resto] = bloque.split("\n")
    return {
      titulo: primera.trim(),
      cuerpo: resto.join("\n").trim(),
    }
  })
}

/**
 * Etiquetas cortas para el indicador de páginas.
 *
 * Se usa el título recortado: un stepper con "Qué tenés que configurar para que
 * el módulo funcione" no se lee de un vistazo, que es su única razón de existir.
 */
export function etiquetasDePaginas(paginas: PaginaDelModal[], max = 22): string[] {
  return paginas.map((p, i) => {
    const t = p.titulo?.trim()
    if (!t) return `${i + 1}`
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
  })
}
