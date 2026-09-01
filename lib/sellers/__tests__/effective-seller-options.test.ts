/**
 * @jest-environment node
 *
 * El tope de una venta compartida tiene que salir del mismo número en la
 * pantalla y en el servidor.
 *
 * El bug (Yamil, Lozada): a Micaela le subieron la comisión a 45% en Reglas de
 * Comisiones, pero el diálogo de operación seguía mostrando "Tope: 35,00%" en
 * rojo. La pantalla leía `users.default_commission_percentage` —write-once, sólo
 * se escribe al dar de alta— mientras el servidor resolvía la precedencia
 * completa y usaba los 45 de `commission_rules`. Resultado: el reparto que el
 * servidor habría aceptado, la pantalla lo marcaba como inválido.
 *
 * Y al revés también pasaba: Maximiliano tiene la regla en 0 y la ficha en 50,
 * así que la pantalla habilitaba un reparto que el servidor iba a rechazar.
 */

jest.mock("@/lib/commissions/seller-commission-profile", () => ({
  resolveSellerCommissionProfiles: jest.fn(),
}))

import { resolveSellerCommissionProfiles } from "@/lib/commissions/seller-commission-profile"
import { resolveEffectiveSellerOptions } from "@/lib/sellers/effective-seller-options"
import { previewSharedSplit } from "@/lib/commissions/split-preview"

const ORG = "org-lozada"
const GIANELLA = "u-gianella"
const MICAELA = "u-micaela"

/** Lo que devuelve la query cruda a `users`: la ficha, ya vieja. */
const FILAS = [
  { id: GIANELLA, name: "Gianella Ponce", default_commission_percentage: 13 },
  { id: MICAELA, name: "Micaela Nader", default_commission_percentage: 35 },
]

function profiles(byId: Record<string, number | null>) {
  ;(resolveSellerCommissionProfiles as jest.Mock).mockResolvedValue(
    new Map(
      Object.entries(byId).map(([id, percentage]) => [
        id,
        { sellerId: id, name: null, percentage, mode: "HALF", source: "SELLER_RULE",
          advisorManagerId: null, advisorManagerPercentage: null },
      ])
    )
  )
}

beforeEach(() => jest.clearAllMocks())

describe("resolveEffectiveSellerOptions", () => {
  it("le gana la regla propia a la ficha vieja", async () => {
    profiles({ [GIANELLA]: 13, [MICAELA]: 45 })

    const options = await resolveEffectiveSellerOptions({}, ORG, FILAS)

    expect(options.find((o) => o.id === MICAELA)!.default_commission_percentage).toBe(45)
    expect(options.find((o) => o.id === GIANELLA)!.default_commission_percentage).toBe(13)
  })

  it("un 0 explícito de la regla también gana: no cae a la ficha", async () => {
    // El caso de Maximiliano, al revés que el de Micaela: la ficha dice 50 pero
    // la regla lo dejó en 0. Si el 0 se tratara como "sin valor", la pantalla
    // habilitaría un reparto que el servidor rechaza.
    profiles({ [MICAELA]: 0 })

    const options = await resolveEffectiveSellerOptions({}, ORG, [FILAS[1]])

    expect(options[0].default_commission_percentage).toBe(0)
  })

  it("un null del perfil es 'sin configurar', no la ficha", async () => {
    profiles({ [MICAELA]: null })

    const options = await resolveEffectiveSellerOptions({}, ORG, [FILAS[1]])

    expect(options[0].default_commission_percentage).toBeNull()
  })

  it("sin org no consulta y devuelve la ficha", async () => {
    const options = await resolveEffectiveSellerOptions({}, null, FILAS)

    expect(resolveSellerCommissionProfiles).not.toHaveBeenCalled()
    expect(options.find((o) => o.id === MICAELA)!.default_commission_percentage).toBe(35)
  })

  it("si la resolución falla, la lista sigue viniendo con la ficha", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    ;(resolveSellerCommissionProfiles as jest.Mock).mockRejectedValue(new Error("boom"))

    const options = await resolveEffectiveSellerOptions({}, ORG, FILAS)

    // Un tope desactualizado es un cartel equivocado; una lista vacía es una
    // operación que no se puede cargar.
    expect(options).toHaveLength(2)
    expect(options.find((o) => o.id === MICAELA)!.default_commission_percentage).toBe(35)
    spy.mockRestore()
  })

  it("un vendedor sin perfil resuelto conserva lo que tenía", async () => {
    profiles({ [MICAELA]: 45 })

    const options = await resolveEffectiveSellerOptions({}, ORG, FILAS)

    expect(options.find((o) => o.id === GIANELLA)!.default_commission_percentage).toBe(13)
  })
})

describe("el tope que ve el usuario", () => {
  /**
   * Reproduce el caso exacto del reporte: operación #64d727d8, Gianella
   * principal y Micaela secundaria.
   */
  it("con la ficha vieja el tope da 35 — el número que Yamil vio en rojo", () => {
    const reparto = previewSharedSplit(
      [
        { id: GIANELLA, default_commission_percentage: 13 },
        { id: MICAELA, default_commission_percentage: 35 },
      ],
      GIANELLA,
      MICAELA
    )

    expect(reparto.ceiling).toBe(35)
    // La sugerencia es la mitad de cada uno (modo HALF); el 6,5 / 28,5 de la
    // captura no es sugerido: es lo que se tipea a mano para llegar justo al
    // tope. Por eso el tope equivocado importa tanto — es el número contra el
    // que la gente ajusta.
    expect(reparto.primary).toBe(6.5)
    expect(reparto.secondary).toBe(17.5)
  })

  it("el reparto que Yamil quería quedaba en rojo con el tope viejo", () => {
    const reparto = previewSharedSplit(
      [
        { id: GIANELLA, default_commission_percentage: 13 },
        { id: MICAELA, default_commission_percentage: 35 },
      ],
      GIANELLA,
      MICAELA,
      { primary: 6.5, secondary: 38.5 }
    )

    expect(reparto.exceedsCeiling).toBe(true)
  })

  it("con el porcentaje efectivo el tope da 45 y el reparto que quería entra", async () => {
    profiles({ [GIANELLA]: 13, [MICAELA]: 45 })
    const options = await resolveEffectiveSellerOptions({}, ORG, FILAS)

    const reparto = previewSharedSplit(options, GIANELLA, MICAELA, {
      primary: 6.5,
      secondary: 38.5,
    })

    expect(reparto.ceiling).toBe(45)
    expect(reparto.total).toBe(45)
    expect(reparto.exceedsCeiling).toBe(false)
  })
})
