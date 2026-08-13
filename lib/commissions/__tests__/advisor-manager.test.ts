/**
 * VIB-102 — Comisión del administrador de un asesor independiente.
 *
 * El módulo es puro, así que se puede verificar de forma exhaustiva lo que más
 * importa: que el resultado no dependa del orden en que vengan los vendedores.
 * En producción "quién es el principal" es un dato blando —a veces la carga el
 * socio y se pone a sí mismo primero— y no puede mover plata.
 */

import { resolveAdvisorManagerOverrides } from "@/lib/commissions/advisor-manager"

const free = (
  sellerId: string,
  managerId: string | null,
  percentage: number | null
) => ({ sellerId, advisorManagerId: managerId, advisorManagerPercentage: percentage })

describe("resolveAdvisorManagerOverrides", () => {
  it("un free administrado genera la comisión de su administrador", () => {
    const { overrides, warnings } = resolveAdvisorManagerOverrides([free("f1", "mica", 5)])

    expect(overrides).toEqual([{ managerId: "mica", percentage: 5, sourceSellerIds: ["f1"] }])
    expect(warnings).toEqual([])
  })

  it("un vendedor sin administrador no genera nada", () => {
    const { overrides, warnings } = resolveAdvisorManagerOverrides([free("jose", null, null)])

    expect(overrides).toEqual([])
    expect(warnings).toEqual([])
  })

  it("un administrador sin porcentaje no cobra: no se inventa un default", () => {
    const sinPct = resolveAdvisorManagerOverrides([free("f1", "mica", null)])
    const enCero = resolveAdvisorManagerOverrides([free("f1", "mica", 0)])

    expect(sinPct.overrides).toEqual([])
    expect(enCero.overrides).toEqual([])
    expect(sinPct.warnings).toEqual([
      { code: "manager_missing_percentage", sellerId: "f1", managerId: "mica" },
    ])
  })

  it("un porcentaje negativo se trata como sin configurar", () => {
    const { overrides, warnings } = resolveAdvisorManagerOverrides([free("f1", "mica", -5)])

    expect(overrides).toEqual([])
    expect(warnings[0].code).toBe("manager_missing_percentage")
  })

  it("el mismo administrador para los dos vendedores cobra una vez, la mayor", () => {
    const { overrides } = resolveAdvisorManagerOverrides([
      free("f1", "mica", 5),
      free("f2", "mica", 7),
    ])

    expect(overrides).toEqual([
      { managerId: "mica", percentage: 7, sourceSellerIds: ["f1", "f2"] },
    ])
  })

  it("dos administradores distintos cobran cada uno lo suyo", () => {
    const { overrides } = resolveAdvisorManagerOverrides([
      free("f1", "mica", 5),
      free("f2", "rama", 3),
    ])

    expect(overrides).toEqual([
      { managerId: "mica", percentage: 5, sourceSellerIds: ["f1"] },
      { managerId: "rama", percentage: 3, sourceSellerIds: ["f2"] },
    ])
  })

  it("un vendedor que figura como su propio administrador se ignora", () => {
    // La base lo prohíbe con un CHECK; si una fila vieja se colara, duplicarle
    // el porcentaje sería peor que ignorarlo.
    const { overrides, warnings } = resolveAdvisorManagerOverrides([free("mica", "mica", 5)])

    expect(overrides).toEqual([])
    expect(warnings).toEqual([{ code: "manager_is_self", sellerId: "mica" }])
  })

  it("el resultado no depende del orden de los vendedores", () => {
    const casos = [
      [free("f1", "mica", 5), free("f2", "rama", 3)],
      [free("f1", "mica", 5), free("f2", "mica", 7)],
      [free("f1", "mica", 5), free("f2", null, null)],
      [free("f1", "mica", null), free("f2", "rama", 3)],
      [free("f1", "mica", 5), free("mica", "mica", 9)],
    ]

    for (const [a, b] of casos) {
      expect(resolveAdvisorManagerOverrides([a, b])).toEqual(
        resolveAdvisorManagerOverrides([b, a])
      )
    }
  })
})
