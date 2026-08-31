import { getTourById, resolveTourForPath } from "../registry"
import { resolveVisibleSteps } from "../filter"

describe("onboarding de Emilia en CRM", () => {
  it("presenta Emilia brevemente en el recorrido general del CRM", () => {
    const tour = getTourById("crm-kanban")

    expect(tour).not.toBeNull()
    const emiliaStep = tour!.steps.find((step) => step.id === "cotizar-con-emilia")

    expect(emiliaStep).toBeDefined()
    expect(emiliaStep).toMatchObject({
      requirePermission: { module: "leads", permission: "write" },
    })
    expect(emiliaStep!.target).toBeUndefined()

    const copy = [emiliaStep!.title, emiliaStep!.body].join(" ")

    expect(copy).toMatch(/Más[^.]*Cotizar/i)
    expect(copy).toMatch(/opciones reales|cotización/i)
    expect(emiliaStep!.details).toBeUndefined()
  })

  it("define una guía contextual sobre el prompt dentro de Emilia", () => {
    const tour = getTourById("cotizar-emilia")

    expect(tour).toMatchObject({
      kind: "form",
      scope: "user",
      match: ["/sales/crm-manychat"],
      autoStart: false,
    })
    expect(tour!.launchHint).toMatch(/lead.*Más.*Cotizar/i)
    expect(tour!.steps.map((step) => step.target)).toEqual([
      "emilia.prompt-guide",
      "emilia.prompt",
      "emilia.send",
    ])
    expect(
      tour!.steps.every(
        (step) =>
          step.requirePermission?.module === "leads" &&
          step.requirePermission.permission === "write"
      )
    ).toBe(true)
    expect(resolveTourForPath("/sales/crm-manychat")?.id).toBe("crm-kanban")
    expect(
      resolveVisibleSteps(tour!, ["VIEWER"], { isMobile: false, can: () => false })
    ).toEqual([])

    const copy = tour!.steps
      .flatMap((step) => [step.title, step.body, ...(step.details ?? [])])
      .join(" ")
    expect(copy).toMatch(/origen/i)
    expect(copy).toMatch(/destino/i)
    expect(copy).toMatch(/fecha/i)
    expect(copy).toMatch(/pasajer/i)
    expect(copy).toMatch(/preferencia/i)
  })
})
