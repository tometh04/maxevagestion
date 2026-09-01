/**
 * Lectura de qué servicios comisionan en una agencia.
 *
 * Lo único que se fija acá es el comportamiento degradado: TODOS los caminos
 * rotos —sin agencia, sin fila, jsonb basura, error de PostgREST, excepción—
 * tienen que caer en el set histórico. La alternativa (caer en "no comisiona
 * nada") le dejaría de pagar a un vendedor sin que nadie se entere.
 */

import {
  DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG,
  getServiceCommissionTypesConfig,
} from "@/lib/commissions/service-commission"

const AGENCY = "11111111-1111-1111-1111-111111111111"

function supabaseReturning(result: any) {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => result),
        })),
      })),
    })),
  }
}

const historico = () => Array.from(DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG.types).sort()

describe("getServiceCommissionTypesConfig", () => {
  it("sin agencia no consulta y devuelve el set histórico", async () => {
    const supabase = supabaseReturning({ data: null, error: null })
    const config = await getServiceCommissionTypesConfig(supabase, null)
    expect(Array.from(config.types).sort()).toEqual(historico())
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("devuelve lo que configuró la agencia", async () => {
    const supabase = supabaseReturning({
      data: { commission_service_types: ["SEAT", "ASSISTANCE"] },
      error: null,
    })
    const config = await getServiceCommissionTypesConfig(supabase, AGENCY)
    expect(Array.from(config.types).sort()).toEqual(["ASSISTANCE", "SEAT"])
  })

  it("una agencia sin fila de financial_settings cae al set histórico", async () => {
    const config = await getServiceCommissionTypesConfig(
      supabaseReturning({ data: null, error: null }),
      AGENCY
    )
    expect(Array.from(config.types).sort()).toEqual(historico())
  })

  it("un jsonb que no es array cae al set histórico", async () => {
    const config = await getServiceCommissionTypesConfig(
      supabaseReturning({ data: { commission_service_types: "HOTEL" }, error: null }),
      AGENCY
    )
    expect(Array.from(config.types).sort()).toEqual(historico())
  })

  it("un error de lectura cae al set histórico", async () => {
    // Es el caso de un deploy adelantado a la migración: PostgREST devuelve
    // error porque la columna no existe todavía, y el alta de servicios tiene
    // que seguir andando como venía.
    const config = await getServiceCommissionTypesConfig(
      supabaseReturning({ data: null, error: { message: "column does not exist" } }),
      AGENCY
    )
    expect(Array.from(config.types).sort()).toEqual(historico())
  })

  it("una excepción tampoco rompe el cálculo", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    const supabase = {
      from: jest.fn(() => {
        throw new Error("boom")
      }),
    }
    const config = await getServiceCommissionTypesConfig(supabase, AGENCY)
    expect(Array.from(config.types).sort()).toEqual(historico())
    spy.mockRestore()
  })
})
