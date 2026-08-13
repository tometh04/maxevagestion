/**
 * VIB-63 — Reparto de comisión en ventas compartidas.
 *
 * El test central de este archivo no es ninguno de los ejemplos puntuales sino
 * la simetría exhaustiva: el cliente reportó que "a veces el secundario carga la
 * venta pero se pone como principal" y el resultado cambiaba. Verificar los 324
 * pares de la grilla es lo que convierte "no importa quién carga la venta" en
 * algo comprobado y no en una promesa del código.
 */

import {
  resolveSharedSplit,
  resolveSoloPercentage,
  type SharedSaleMode,
  type SharedSplitParticipant,
} from "@/lib/commissions/shared-split"

const half = (sellerId: string, percentage: number | null): SharedSplitParticipant => ({
  sellerId,
  percentage,
  mode: "HALF",
})

const absorb = (sellerId: string, percentage: number | null): SharedSplitParticipant => ({
  sellerId,
  percentage,
  mode: "ABSORB",
})

describe("resolveSharedSplit — los ejemplos del ticket", () => {
  it("Jose (20%) + Santi (35%, absorbe) → Jose 10, Santi 25", () => {
    const result = resolveSharedSplit(half("jose", 20), absorb("santi", 35))

    expect(result.bySellerId).toEqual({ jose: 10, santi: 25 })
    expect(result.rule).toBe("ABSORB")
    expect(result.absorberId).toBe("santi")
    // El total es exactamente el porcentaje del absorbente: paga de lo suyo.
    expect(result.totalPct).toBe(35)
    expect(result.warnings).toEqual([])
  })

  it("Jose (20%) + Julieta (60%, absorbe) → Jose 10, Julieta 50", () => {
    const result = resolveSharedSplit(half("jose", 20), absorb("julieta", 60))

    expect(result.bySellerId).toEqual({ jose: 10, julieta: 50 })
    expect(result.totalPct).toBe(60)
  })

  it("regla general: sin absorbentes, cada uno cobra la mitad de lo suyo", () => {
    const result = resolveSharedSplit(half("jose", 20), half("malena", 13))

    expect(result.bySellerId).toEqual({ jose: 10, malena: 6.5 })
    expect(result.rule).toBe("HALF_HALF")
    expect(result.absorberId).toBeNull()
    expect(result.totalPct).toBe(16.5)
  })
})

describe("resolveSharedSplit — simetría (el requisito del ticket)", () => {
  const PCTS = [0, 10, 13, 15, 20, 35, 45, 50, 60]
  const MODES: SharedSaleMode[] = ["HALF", "ABSORB"]

  const GRID: SharedSplitParticipant[][] = []
  for (const pctA of PCTS) {
    for (const modeA of MODES) {
      for (const pctB of PCTS) {
        for (const modeB of MODES) {
          GRID.push([
            { sellerId: "vendedor-a", percentage: pctA, mode: modeA },
            { sellerId: "vendedor-b", percentage: pctB, mode: modeB },
          ])
        }
      }
    }
  }

  it("cubre los 324 pares de la grilla", () => {
    expect(GRID).toHaveLength(324)
  })

  it("invertir principal y secundario no cambia absolutamente nada", () => {
    for (const [a, b] of GRID) {
      const directo = resolveSharedSplit(a, b)
      const invertido = resolveSharedSplit(b, a)

      // Comparación del resultado completo, no solo de los montos: si algún día
      // la regla o los warnings dependieran del orden, esto lo detecta.
      expect({ par: [a, b], resultado: invertido }).toEqual({
        par: [a, b],
        resultado: directo,
      })
    }
  })

  it("ningún vendedor cobra negativo en toda la grilla", () => {
    for (const [a, b] of GRID) {
      const { bySellerId } = resolveSharedSplit(a, b)
      for (const [sellerId, pct] of Object.entries(bySellerId)) {
        expect({ par: [a, b], sellerId, pct: pct >= 0 }).toEqual({
          par: [a, b],
          sellerId,
          pct: true,
        })
      }
    }
  })

  it("nadie cobra más que su propio porcentaje, ni el total supera al mayor", () => {
    for (const [a, b] of GRID) {
      const result = resolveSharedSplit(a, b)
      const pctA = a.percentage ?? 0
      const pctB = b.percentage ?? 0

      const ok =
        (result.bySellerId[a.sellerId] ?? 0) <= pctA + 0.001 &&
        (result.bySellerId[b.sellerId] ?? 0) <= pctB + 0.001 &&
        result.totalPct <= Math.max(pctA, pctB) + 0.001

      expect({ par: [a, b], ok }).toEqual({ par: [a, b], ok: true })
    }
  })
})

describe("resolveSharedSplit — casos borde", () => {
  it("cuando los dos absorben, absorbe el de mayor porcentaje", () => {
    const result = resolveSharedSplit(absorb("santi", 35), absorb("julieta", 60))

    expect(result.absorberId).toBe("julieta")
    expect(result.bySellerId).toEqual({ julieta: 42.5, santi: 17.5 })
  })

  it("con dos absorbentes de igual porcentaje el desempate es estable", () => {
    const directo = resolveSharedSplit(absorb("santi", 35), absorb("micaela", 35))
    const invertido = resolveSharedSplit(absorb("micaela", 35), absorb("santi", 35))

    expect(directo).toEqual(invertido)
    // Con porcentajes iguales el reparto da lo mismo por simetría (17,5 y 17,5),
    // así que quién quede marcado como absorbente no cambia la plata.
    expect(directo.bySellerId).toEqual({ santi: 17.5, micaela: 17.5 })
  })

  it("absorber es un techo, no un premio: puede cobrar menos que la mitad de lo suyo", () => {
    // Ramiro 45 (general) + Santi 35 (absorbe): Santi cobra 12,5, bastante menos
    // que los 17,5 que le tocarían con la regla general. Está bien según la
    // fórmula, pero es contraintuitivo y por eso queda documentado acá.
    const result = resolveSharedSplit(half("ramiro", 45), absorb("santi", 35))

    expect(result.bySellerId).toEqual({ ramiro: 22.5, santi: 12.5 })
  })

  it("si al absorbente no le alcanza, cobra 0 y no se le recorta al otro", () => {
    const result = resolveSharedSplit(half("ramiro", 45), absorb("diego", 10))

    expect(result.bySellerId).toEqual({ ramiro: 22.5, diego: 0 })
    expect(result.warnings).toEqual([
      { code: "absorber_underwater", sellerId: "diego", shortfall: 12.5 },
    ])
  })

  it("un vendedor sin porcentaje configurado cobra 0 y avisa", () => {
    const result = resolveSharedSplit(half("jose", 20), half("nuevo", null))

    expect(result.bySellerId).toEqual({ jose: 10, nuevo: 0 })
    expect(result.warnings).toEqual([{ code: "missing_percentage", sellerId: "nuevo" }])
  })

  it("un vendedor sin porcentaje no puede absorber (taparía un error de carga)", () => {
    const result = resolveSharedSplit(half("jose", 20), absorb("nuevo", 0))

    // Si "nuevo" absorbiera, cobraría 0 − 10 → 0 y el resultado se vería igual
    // que un reparto válido. Cae a la regla general y el warning queda visible.
    expect(result.rule).toBe("HALF_HALF")
    expect(result.bySellerId).toEqual({ jose: 10, nuevo: 0 })
  })

  it("el mismo vendedor dos veces no es una venta compartida", () => {
    const result = resolveSharedSplit(half("jose", 20), half("jose", 20))

    expect(result.rule).toBe("SINGLE")
    expect(result.bySellerId).toEqual({ jose: 20 })
    expect(result.warnings).toEqual([{ code: "same_seller", sellerId: "jose" }])
  })

  it("porcentajes negativos o inválidos se tratan como sin configurar", () => {
    const result = resolveSharedSplit(half("jose", 20), half("raro", -15))

    expect(result.bySellerId).toEqual({ jose: 10, raro: 0 })
    expect(result.warnings).toEqual([{ code: "missing_percentage", sellerId: "raro" }])
  })

  it("redondea a 2 decimales", () => {
    const result = resolveSharedSplit(half("a", 13.33), half("b", 7.77))

    expect(result.bySellerId).toEqual({ a: 6.67, b: 3.89 })
    expect(result.totalPct).toBe(10.56)
  })
})

describe("resolveSoloPercentage", () => {
  it("una venta no compartida paga el porcentaje completo", () => {
    expect(resolveSoloPercentage(35)).toBe(35)
  })

  it("sin porcentaje configurado paga 0", () => {
    expect(resolveSoloPercentage(null)).toBe(0)
    expect(resolveSoloPercentage(-10)).toBe(0)
  })
})
