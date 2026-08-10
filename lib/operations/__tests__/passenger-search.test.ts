import {
  buildPassengerSearchOrGroups,
  sanitizeSearchTerm,
} from "@/lib/operations/passenger-search"

describe("buildPassengerSearchOrGroups (VIB-102)", () => {
  it("una palabra genera un único grupo sobre nombre y apellido", () => {
    expect(buildPassengerSearchOrGroups("Olivera")).toEqual([
      "first_name.ilike.%Olivera%,last_name.ilike.%Olivera%",
    ])
  })

  it("cada palabra genera su propio grupo (AND entre palabras)", () => {
    // El bug: un solo grupo con las 3 palabras es un OR, así que matcheaba a
    // CUALQUIER cliente llamado "Maria" y el tope de filas se comía al titular.
    const groups = buildPassengerSearchOrGroups("Maria Belen Olivera")
    expect(groups).toHaveLength(3)
    expect(groups).toEqual([
      "first_name.ilike.%Maria%,last_name.ilike.%Maria%",
      "first_name.ilike.%Belen%,last_name.ilike.%Belen%",
      "first_name.ilike.%Olivera%,last_name.ilike.%Olivera%",
    ])
  })

  it("sigue matcheando apellidos compuestos partidos entre nombre y apellido", () => {
    // "Lo Bianco" = first_name "Lo" + last_name "Bianco": cada palabra matchea
    // un campo distinto del MISMO cliente, así que el AND se cumple.
    expect(buildPassengerSearchOrGroups("Lo Bianco")).toEqual([
      "first_name.ilike.%Lo%,last_name.ilike.%Lo%",
      "first_name.ilike.%Bianco%,last_name.ilike.%Bianco%",
    ])
  })

  it("ignora palabras de menos de 2 caracteres", () => {
    expect(buildPassengerSearchOrGroups("J Perez")).toEqual([
      "first_name.ilike.%Perez%,last_name.ilike.%Perez%",
    ])
  })

  it("si ninguna palabra llega al mínimo, busca la frase entera", () => {
    expect(buildPassengerSearchOrGroups("J P")).toEqual([
      "first_name.ilike.%J P%,last_name.ilike.%J P%",
    ])
  })

  it("neutraliza caracteres que rompen la gramática or= de PostgREST", () => {
    // "Perez, Juan" partía la lista del or= y tiraba la búsqueda entera.
    expect(buildPassengerSearchOrGroups("Perez, Juan")).toEqual([
      "first_name.ilike.%Perez%,last_name.ilike.%Perez%",
      "first_name.ilike.%Juan%,last_name.ilike.%Juan%",
    ])
    expect(buildPassengerSearchOrGroups("Gonzalez (h)")).toEqual([
      "first_name.ilike.%Gonzalez%,last_name.ilike.%Gonzalez%",
    ])
  })

  it("devuelve [] cuando no queda nada buscable", () => {
    expect(buildPassengerSearchOrGroups("   ")).toEqual([])
    expect(buildPassengerSearchOrGroups(",,,")).toEqual([])
  })

  it("permite pasar otros campos", () => {
    expect(buildPassengerSearchOrGroups("ana", ["first_name", "last_name", "email"])).toEqual([
      "first_name.ilike.%ana%,last_name.ilike.%ana%,email.ilike.%ana%",
    ])
  })
})

describe("sanitizeSearchTerm", () => {
  it("saca comas, paréntesis, comillas y backslashes", () => {
    expect(sanitizeSearchTerm(`Perez, "Juan" (h)\\`)).toBe("Perez   Juan   h")
  })

  it("recorta espacios de los extremos", () => {
    expect(sanitizeSearchTerm("  Fernandez  ")).toBe("Fernandez")
  })
})
