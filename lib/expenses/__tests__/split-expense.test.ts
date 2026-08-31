/**
 * @jest-environment node
 *
 * Lo que se fija acá es un invariante de plata: dividir un gasto entre oficinas
 * no puede cambiar cuánto se gastó. Si la suma de las partes no da exactamente
 * el total, el gasto se rompe y nadie se entera hasta el cierre de mes.
 */
import {
  repartirEnPartesIguales,
  validarReparto,
  faltantePorRepartir,
} from "../split-expense"

const sumaCentavos = (xs: number[]) => xs.reduce((a, b) => a + Math.round(b * 100), 0)

describe("repartirEnPartesIguales", () => {
  it("divide al medio el caso que lo motivó (Facebook, USD 2.336,46)", () => {
    expect(repartirEnPartesIguales(2336.46, 2)).toEqual([1168.23, 1168.23])
  })

  it("reparte el centavo que sobra en vez de perderlo", () => {
    // 100 / 3 en flotante da 33,33 tres veces = 99,99: falta un centavo.
    const partes = repartirEnPartesIguales(100, 3)
    expect(partes).toEqual([33.34, 33.33, 33.33])
    expect(sumaCentavos(partes)).toBe(10000)
  })

  it("cierra exacto para cualquier cantidad de oficinas", () => {
    for (const total of [0.01, 0.03, 1, 99.99, 2336.46, 1234567.89]) {
      for (const n of [2, 3, 4, 5, 6, 7]) {
        expect(sumaCentavos(repartirEnPartesIguales(total, n))).toBe(Math.round(total * 100))
      }
    }
  })

  it("no arrastra el error del punto flotante", () => {
    // 0.1 + 0.2 !== 0.3 en flotante; en centavos sí.
    expect(sumaCentavos(repartirEnPartesIguales(0.3, 3))).toBe(30)
  })

  it("devuelve vacío si no hay nada que repartir", () => {
    expect(repartirEnPartesIguales(0, 2)).toEqual([])
    expect(repartirEnPartesIguales(-100, 2)).toEqual([])
    expect(repartirEnPartesIguales(100, 0)).toEqual([])
  })
})

describe("validarReparto", () => {
  const rosario = "ag-rosario"
  const madero = "ag-madero"

  it("acepta un reparto que cierra al centavo", () => {
    expect(
      validarReparto(2336.46, [
        { agencyId: rosario, amount: 1168.23 },
        { agencyId: madero, amount: 1168.23 },
      ])
    ).toEqual({ ok: true })
  })

  it("acepta un reparto desparejo si suma el total", () => {
    // Como el 1.400 / 600 que Yamil ya carga a mano.
    expect(
      validarReparto(2000, [
        { agencyId: rosario, amount: 1400 },
        { agencyId: madero, amount: 600 },
      ]).ok
    ).toBe(true)
  })

  it("rechaza si falta un centavo", () => {
    const res = validarReparto(2336.46, [
      { agencyId: rosario, amount: 1168.23 },
      { agencyId: madero, amount: 1168.22 },
    ])
    expect(res.ok).toBe(false)
    expect((res as any).error).toContain("Faltan 0.01")
  })

  it("rechaza si sobra", () => {
    const res = validarReparto(100, [
      { agencyId: rosario, amount: 60 },
      { agencyId: madero, amount: 50 },
    ])
    expect(res.ok).toBe(false)
    expect((res as any).error).toContain("10.00 de más")
  })

  it("rechaza una sola oficina: eso no es dividir", () => {
    expect(validarReparto(100, [{ agencyId: rosario, amount: 100 }]).ok).toBe(false)
  })

  it("rechaza repetir la misma oficina", () => {
    const res = validarReparto(100, [
      { agencyId: rosario, amount: 50 },
      { agencyId: rosario, amount: 50 },
    ])
    expect(res.ok).toBe(false)
    expect((res as any).error).toContain("misma oficina")
  })

  it("rechaza una parte en cero", () => {
    // Una oficina con 0 no es una parte: es no imputarle nada.
    expect(
      validarReparto(100, [
        { agencyId: rosario, amount: 100 },
        { agencyId: madero, amount: 0 },
      ]).ok
    ).toBe(false)
  })

  it("rechaza una parte negativa", () => {
    expect(
      validarReparto(100, [
        { agencyId: rosario, amount: 150 },
        { agencyId: madero, amount: -50 },
      ]).ok
    ).toBe(false)
  })

  it("rechaza una parte sin oficina elegida", () => {
    expect(
      validarReparto(100, [
        { agencyId: rosario, amount: 50 },
        { agencyId: "", amount: 50 },
      ]).ok
    ).toBe(false)
  })

  it("acepta lo que produce repartirEnPartesIguales, incluso con resto", () => {
    const oficinas = ["a", "b", "c"]
    const partes = repartirEnPartesIguales(100, 3).map((amount, i) => ({
      agencyId: oficinas[i],
      amount,
    }))
    expect(validarReparto(100, partes)).toEqual({ ok: true })
  })
})

describe("faltantePorRepartir", () => {
  it("dice cuánto falta mientras se completa el reparto", () => {
    expect(faltantePorRepartir(2336.46, [{ agencyId: "a", amount: 1000 }])).toBeCloseTo(1336.46, 2)
  })

  it("da 0 cuando cierra", () => {
    expect(
      faltantePorRepartir(2336.46, [
        { agencyId: "a", amount: 1168.23 },
        { agencyId: "b", amount: 1168.23 },
      ])
    ).toBe(0)
  })

  it("da negativo cuando sobra", () => {
    expect(faltantePorRepartir(100, [{ agencyId: "a", amount: 120 }])).toBeCloseTo(-20, 2)
  })

  it("ignora los importes todavía vacíos en vez de romper", () => {
    expect(faltantePorRepartir(100, [{ agencyId: "a", amount: NaN }])).toBe(100)
  })
})
