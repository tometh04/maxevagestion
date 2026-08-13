import { entryStepIndex, stepContextAnchors } from "../entry"
import { setupCuentaTour } from "../definitions/setup-cuenta"
import { operationsListTour } from "../definitions/operations-list"

describe("stepContextAnchors", () => {
  it("deriva las anclas del prepare.click", () => {
    const empresa = setupCuentaTour.steps.find((s) => s.id === "empresa")!
    expect(stepContextAnchors(empresa)).toEqual(["settings.tab-interface"])
  })

  it("no devuelve nada para pasos sin prepare", () => {
    const bienvenida = setupCuentaTour.steps.find((s) => s.id === "bienvenida")!
    expect(stepContextAnchors(bienvenida)).toEqual([])
  })
})

describe("entryStepIndex", () => {
  const steps = setupCuentaTour.steps

  it("entra por el paso del tab que está abierto", () => {
    // Parado en Facturación AFIP, la guía tiene que abrir en "Conectar AFIP",
    // no en el modal de bienvenida.
    const index = entryStepIndex(steps, (a) => a === "settings.tab-afip")
    expect(steps[index].id).toBe("afip")
  })

  it("distingue entre tabs", () => {
    const index = entryStepIndex(steps, (a) => a === "settings.tab-users")
    expect(steps[index].id).toBe("usuarios")
  })

  it("cae al principio si ningún tab matchea", () => {
    expect(entryStepIndex(steps, () => false)).toBe(0)
  })

  it("cae al principio en guías sin tabs", () => {
    // operations-list no usa prepare, así que siempre arranca de cero aunque
    // el predicado diga que todo está activo.
    expect(entryStepIndex(operationsListTour.steps, () => true)).toBe(0)
  })

  it("indexa contra la lista filtrada que recibe, no contra la del tour", () => {
    // Si los permisos recortaron pasos, el índice tiene que ser válido en la
    // lista recortada: devolverlo contra tour.steps apuntaría a otro paso.
    const recortada = steps.filter((s) => s.id === "usuarios" || s.id === "afip")
    const index = entryStepIndex(recortada, (a) => a === "settings.tab-afip")
    expect(recortada[index].id).toBe("afip")
    expect(index).toBe(1)
  })

  it("no matchea un paso cuyo primer tab está activo pero necesita varios", () => {
    const multi = [{ id: "x", title: "X", body: "", prepare: { click: ["a.uno", "a.dos"] } }]
    expect(entryStepIndex(multi as never, (a) => a === "a.uno")).toBe(0)
  })
})
