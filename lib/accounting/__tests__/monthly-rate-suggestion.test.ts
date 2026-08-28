/**
 * Cotización sugerida del mes — VIB-141.
 *
 * La sugerencia alimenta la valuación de toda la contabilidad de una agencia,
 * así que lo que importa no es solo que el número salga bien: es que NUNCA
 * devuelva un valor inventado cuando no hay datos. Un cero o un NaN pasando por
 * acá valuaría un ejercicio entero mal.
 */
import {
  calcularSugerencia,
  rangoDelMes,
  sugerirCotizacionEnRango,
  sugerirCotizacionMensual,
} from "../monthly-rate-suggestion"

const r = (rate_date: string, rate: number) => ({ rate_date, rate })

/**
 * Supabase de mentira que aplica el rango pedido sobre un set fijo.
 *
 * Verifica algo que mirando el número no se ve: que el rango que llega a
 * PostgREST sea el correcto. Si `sugerirCotizacionMensual` dejara de acotar por
 * mes, el promedio saldría de todo el histórico y seguiría pareciendo un TC
 * plausible.
 */
function fakeSupabase(rows: Array<{ rate_date: string; rate: number }>) {
  const filtros: Record<string, string> = {}
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: string) => {
      filtros[col] = val
      return chain
    },
    gte: (_col: string, val: string) => {
      filtros.desde = val
      return chain
    },
    lte: (_col: string, val: string) => {
      filtros.hasta = val
      return chain
    },
    order: () => ({
      data: rows.filter((x) => x.rate_date >= filtros.desde && x.rate_date <= filtros.hasta),
    }),
  }
  return { supabase: { from: () => chain } as any, filtros }
}

describe("calcularSugerencia", () => {
  const agosto = [
    r("2026-08-01", 1500),
    r("2026-08-15", 1520),
    r("2026-08-29", 1540),
  ]

  it("CIERRE toma la última cotización del mes", () => {
    // Un balance mide un momento: el saldo al cierre se valúa al cierre.
    expect(calcularSugerencia(agosto, "CIERRE")).toMatchObject({
      rate: 1540,
      muestras: 3,
      ultima: "2026-08-29",
    })
  })

  it("PROMEDIO promedia el mes", () => {
    // Un estado de resultados mide un período.
    expect(calcularSugerencia(agosto, "PROMEDIO").rate).toBe(1520)
  })

  it("no depende del orden en que vengan las cotizaciones", () => {
    const desordenado = [agosto[2], agosto[0], agosto[1]]
    expect(calcularSugerencia(desordenado, "CIERRE").rate).toBe(1540)
    expect(calcularSugerencia(desordenado, "PROMEDIO").rate).toBe(1520)
  })

  it("devuelve null si no hay cotizaciones, no cero", () => {
    // Un cero acá valuaría todo el ejercicio a cero. Tiene que ser null para
    // que el caller sepa que no hay dato y pida uno.
    const vacio = calcularSugerencia([], "CIERRE")
    expect(vacio.rate).toBeNull()
    expect(vacio.muestras).toBe(0)
  })

  it("ignora cotizaciones en cero o negativas", () => {
    const sucio = [r("2026-08-01", 0), r("2026-08-02", -5), r("2026-08-03", 1500)]
    expect(calcularSugerencia(sucio, "CIERRE").rate).toBe(1500)
    expect(calcularSugerencia(sucio, "PROMEDIO").rate).toBe(1500)
    expect(calcularSugerencia(sucio, "CIERRE").muestras).toBe(1)
  })

  it("devuelve null si TODAS son inválidas", () => {
    expect(calcularSugerencia([r("2026-08-01", 0)], "PROMEDIO").rate).toBeNull()
  })

  it("redondea el promedio a dos decimales", () => {
    const tres = [r("2026-08-01", 1000), r("2026-08-02", 1001), r("2026-08-03", 1001)]
    expect(calcularSugerencia(tres, "PROMEDIO").rate).toBe(1000.67)
  })
})

describe("rangoDelMes", () => {
  it("cubre el mes completo", () => {
    expect(rangoDelMes(2026, 8)).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" })
  })

  it("resuelve los meses de 30 días", () => {
    expect(rangoDelMes(2026, 9).hasta).toBe("2026-09-30")
  })

  it("resuelve febrero en año común y en bisiesto", () => {
    // Sin esto, un 29 de febrero quedaría fuera del rango y su cotización no
    // se contaría.
    expect(rangoDelMes(2026, 2).hasta).toBe("2026-02-28")
    expect(rangoDelMes(2028, 2).hasta).toBe("2028-02-29")
  })

  it("pone el mes en dos dígitos", () => {
    expect(rangoDelMes(2026, 1)).toEqual({ desde: "2026-01-01", hasta: "2026-01-31" })
  })
})

describe("sugerirCotizacionEnRango", () => {
  // Julio y agosto con cotizaciones distintas: si el rango no se respetara, el
  // promedio se contaminaría con el otro mes.
  const historico = [
    r("2026-07-10", 1500),
    r("2026-07-20", 1510),
    r("2026-08-05", 1600),
    r("2026-08-25", 1620),
  ]

  it("promedia solo lo que cae dentro del rango pedido", async () => {
    const { supabase } = fakeSupabase(historico)
    const s = await sugerirCotizacionEnRango(supabase, "2026-07-01", "2026-07-31", "PROMEDIO")
    expect(s).toMatchObject({ rate: 1505, muestras: 2, ultima: "2026-07-20" })
  })

  it("acepta un rango que cruza el corte de mes", async () => {
    // Es el caso que motiva la función: el Societario deja elegir cualquier
    // rango, no solo meses calendario.
    const { supabase } = fakeSupabase(historico)
    const s = await sugerirCotizacionEnRango(supabase, "2026-07-15", "2026-08-15", "PROMEDIO")
    expect(s).toMatchObject({ rate: 1555, muestras: 2 })
  })

  it("CIERRE toma la última del rango, no la del histórico", async () => {
    const { supabase } = fakeSupabase(historico)
    const s = await sugerirCotizacionEnRango(supabase, "2026-07-01", "2026-07-31", "CIERRE")
    expect(s.rate).toBe(1510)
  })

  it("devuelve null si el rango no tiene cotizaciones, no un TC inventado", async () => {
    // El caller tiene que poder decir "no hay dato". Caer a un fallback acá
    // valuaría un cierre entero a una cotización que nadie eligió.
    const { supabase } = fakeSupabase(historico)
    const s = await sugerirCotizacionEnRango(supabase, "2026-05-01", "2026-05-31", "PROMEDIO")
    expect(s.rate).toBeNull()
    expect(s.muestras).toBe(0)
  })
})

describe("sugerirCotizacionMensual", () => {
  const agosto = [r("2026-07-31", 1400), r("2026-08-05", 1600), r("2026-08-25", 1620), r("2026-09-01", 1700)]

  it("sigue acotando al mes después de delegar en el rango", async () => {
    const { supabase, filtros } = fakeSupabase(agosto)
    const s = await sugerirCotizacionMensual(supabase, 2026, 8, "PROMEDIO")
    expect(s).toMatchObject({ rate: 1610, muestras: 2, ultima: "2026-08-25" })
    expect(filtros).toMatchObject({ desde: "2026-08-01", hasta: "2026-08-31" })
  })

  it("mantiene CIERRE como criterio por defecto", async () => {
    // Es el que consume `/api/accounting/monthly-exchange-rates`: cambiarlo
    // movería la cotización de cierre de todas las agencias.
    const { supabase } = fakeSupabase(agosto)
    expect((await sugerirCotizacionMensual(supabase, 2026, 8)).rate).toBe(1620)
  })
})
