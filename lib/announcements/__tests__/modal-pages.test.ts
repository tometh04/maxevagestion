import { partirEnPaginas, etiquetasDePaginas } from "../modal-pages"

describe("texto sin separadores", () => {
  // Es el caso de todas las novedades que ya existen: tienen que seguir
  // viéndose igual, y su primera línea no puede convertirse sola en un título
  // que nadie escribió como tal.
  it("queda en una sola página y sin título", () => {
    const p = partirEnPaginas("Ya podés exportar a Excel.\nEstá en Reportes.")
    expect(p).toEqual([{ titulo: null, cuerpo: "Ya podés exportar a Excel.\nEstá en Reportes." }])
  })

  it("un texto vacío no produce páginas", () => {
    expect(partirEnPaginas("")).toEqual([])
    expect(partirEnPaginas("   \n  ")).toEqual([])
  })
})

describe("texto paginado", () => {
  const texto = [
    "Qué cambió",
    "Ya llevás la contabilidad acá.",
    "---",
    "Los libros",
    "Diario y Mayor en PDF.",
    "---",
    "Para que funcione",
    "Cargá la fecha de inicio.",
  ].join("\n")

  it("toma la primera línea de cada bloque como título", () => {
    const p = partirEnPaginas(texto)
    expect(p).toHaveLength(3)
    expect(p.map((x) => x.titulo)).toEqual(["Qué cambió", "Los libros", "Para que funcione"])
    expect(p[1].cuerpo).toBe("Diario y Mayor en PDF.")
  })

  it("tolera espacios alrededor del separador", () => {
    expect(partirEnPaginas("Uno\ncuerpo\n  ---  \nDos\ncuerpo")).toHaveLength(2)
  })

  it("ignora separadores de más en vez de generar páginas vacías", () => {
    const p = partirEnPaginas("Uno\ncuerpo\n---\n---\nDos\ncuerpo")
    expect(p).toHaveLength(2)
  })

  it("no confunde una línea de guiones más larga con un separador", () => {
    expect(partirEnPaginas("Uno\n-----\nsigue")).toHaveLength(1)
  })

  it("normaliza saltos de Windows", () => {
    expect(partirEnPaginas("Uno\r\ncuerpo\r\n---\r\nDos\r\ncuerpo")).toHaveLength(2)
  })

  it("una página puede tener solo título", () => {
    const p = partirEnPaginas("Uno\ncuerpo\n---\nSolo título")
    expect(p[1]).toEqual({ titulo: "Solo título", cuerpo: "" })
  })
})

describe("etiquetas del indicador", () => {
  it("recorta los títulos largos: un stepper se lee de un vistazo", () => {
    const e = etiquetasDePaginas([
      { titulo: "Qué tenés que configurar para que el módulo funcione", cuerpo: "" },
    ])
    expect(e[0].length).toBeLessThanOrEqual(22)
    expect(e[0].endsWith("…")).toBe(true)
  })

  it("deja intactos los cortos", () => {
    expect(etiquetasDePaginas([{ titulo: "Los libros", cuerpo: "" }])).toEqual(["Los libros"])
  })

  it("sin título usa el número de página", () => {
    expect(etiquetasDePaginas([{ titulo: null, cuerpo: "x" }])).toEqual(["1"])
  })
})
