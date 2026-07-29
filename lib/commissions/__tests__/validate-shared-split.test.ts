/**
 * VIB-63 — Validación del reparto manual.
 *
 * El caso que motivó el cambio está en el primer bloque: con la regla vieja
 * ("la suma no puede superar el porcentaje del principal"), cargar una venta de
 * Emilia con Julieta devolvía un 400 y el equipo lo esquivaba invirtiendo los
 * vendedores.
 */

import {
  validateManualSplit,
  type ManualSplitParticipant,
} from "@/lib/commissions/validate-shared-split"
import { resolveSharedSplit, type SharedSaleMode } from "@/lib/commissions/shared-split"

const p = (
  sellerId: string,
  name: string,
  maxPercentage: number | null,
  assignedPercentage: number
): ManualSplitParticipant => ({ sellerId, name, maxPercentage, assignedPercentage })

describe("validateManualSplit", () => {
  it("deja cargar una venta donde la secundaria comisiona más que el principal", () => {
    // Emilia (15%) carga la venta, Julieta (50%) participa. Con la regla vieja
    // el tope era 15% y esto devolvía 400.
    const result = validateManualSplit(
      p("emilia", "Emilia Roca", 15, 7.5),
      p("julieta", "Julieta", 50, 42.5)
    )

    expect(result).toEqual({ ok: true })
  })

  it("el resultado no depende de quién va primero", () => {
    const a = p("emilia", "Emilia Roca", 15, 7.5)
    const b = p("julieta", "Julieta", 50, 42.5)

    expect(validateManualSplit(a, b)).toEqual(validateManualSplit(b, a))
  })

  it("nadie puede cobrar más que su propio porcentaje", () => {
    const result = validateManualSplit(
      p("emilia", "Emilia Roca", 15, 20),
      p("julieta", "Julieta", 50, 10)
    )

    expect(result.ok).toBe(false)
    // El mensaje nombra a la persona: antes decía "vendedor principal" aunque
    // el problema fuera del otro.
    expect((result as any).error).toContain("Emilia Roca")
    expect((result as any).error).toContain("15.00%")
  })

  it("el total no puede superar al porcentaje más alto de los dos", () => {
    const result = validateManualSplit(
      p("emilia", "Emilia Roca", 15, 15),
      p("julieta", "Julieta", 50, 50)
    )

    expect(result.ok).toBe(false)
    expect((result as any).error).toContain("65.00%")
    expect((result as any).error).toContain("50.00%")
  })

  it("acepta el tope exacto", () => {
    expect(
      validateManualSplit(p("a", "A", 20, 10), p("b", "B", 35, 25))
    ).toEqual({ ok: true })
  })

  it("rechaza porcentajes negativos o no numéricos", () => {
    expect(validateManualSplit(p("a", "A", 20, -1), p("b", "B", 35, 10)).ok).toBe(false)
    expect(
      validateManualSplit(p("a", "A", 20, Number.NaN), p("b", "B", 35, 10)).ok
    ).toBe(false)
  })

  it("avisa cuando falta configurar el porcentaje del vendedor", () => {
    const result = validateManualSplit(
      p("nuevo", "Vendedor Nuevo", null, 10),
      p("b", "B", 35, 10)
    )

    expect(result.ok).toBe(false)
    expect((result as any).error).toContain("Vendedor Nuevo")
    expect((result as any).error).toContain("Configuración")
  })

  it("un vendedor sin porcentaje al que no se le asigna nada no bloquea", () => {
    expect(
      validateManualSplit(p("nuevo", "Nuevo", null, 0), p("b", "B", 35, 17.5))
    ).toEqual({ ok: true })
  })

  it("sin nombre el mensaje sigue siendo legible", () => {
    const result = validateManualSplit(p("a", "", 20, 30), p("b", "B", 35, 0))
    expect((result as any).error).toContain("El vendedor no puede cobrar")
  })
})

describe("el reparto automático siempre pasa la validación manual", () => {
  // Si esto fallara, una operación calculada por el sistema no se podría volver
  // a guardar desde la pantalla: el servidor rechazaría sus propios números.
  const PCTS = [0, 10, 13, 15, 20, 35, 45, 50, 60]
  const MODES: SharedSaleMode[] = ["HALF", "ABSORB"]

  it("sobre toda la grilla de porcentajes y modos", () => {
    for (const pctA of PCTS) {
      for (const modeA of MODES) {
        for (const pctB of PCTS) {
          for (const modeB of MODES) {
            const a = { sellerId: "a", percentage: pctA, mode: modeA }
            const b = { sellerId: "b", percentage: pctB, mode: modeB }
            const split = resolveSharedSplit(a, b)

            const result = validateManualSplit(
              p("a", "A", pctA, split.bySellerId.a ?? 0),
              p("b", "B", pctB, split.bySellerId.b ?? 0)
            )

            expect({ a, b, ok: result.ok }).toEqual({ a, b, ok: true })
          }
        }
      }
    }
  })
})
