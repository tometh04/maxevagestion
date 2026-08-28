/**
 * Períodos contables — VIB-141.
 *
 * Lo que se fija acá no es la aritmética de fechas: es que el cierre se pueda
 * recuperar SOLO. Si el cron no corre, si la agencia activa el automático seis
 * meses tarde, o si alguien lo apaga y lo prende, el sistema tiene que ponerse
 * al día sin que un desarrollador corra nada. Cada test de `periodosPendientes`
 * es uno de esos escenarios.
 */
import {
  esPeriodoValido,
  fechaDeCierre,
  periodoAnterior,
  periodoDe,
  periodoSiguiente,
  periodosPendientes,
  puedeCerrar,
  puedeRecalcular,
  rangoDelPeriodo,
} from "../accounting-periods"

describe("aritmética de períodos", () => {
  it("el período de una fecha es su mes", () => {
    expect(periodoDe("2026-09-15")).toBe("2026-09")
  })

  it("el rango cubre el mes entero", () => {
    expect(rangoDelPeriodo("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" })
  })

  it("febrero bisiesto tiene 29", () => {
    expect(rangoDelPeriodo("2028-02").hasta).toBe("2028-02-29")
  })

  it("febrero no bisiesto tiene 28", () => {
    expect(rangoDelPeriodo("2026-02").hasta).toBe("2026-02-28")
  })

  it("cruza el año en los dos sentidos", () => {
    expect(periodoSiguiente("2026-12")).toBe("2027-01")
    expect(periodoAnterior("2026-01")).toBe("2025-12")
  })

  it("rechaza períodos con mes imposible", () => {
    expect(esPeriodoValido("2026-13")).toBe(false)
    expect(esPeriodoValido("2026-00")).toBe(false)
    expect(esPeriodoValido("2026-9")).toBe(false)
    expect(esPeriodoValido("2026-09")).toBe(true)
  })
})

describe("fechaDeCierre", () => {
  it("un mes se cierra en el mes siguiente", () => {
    // No se puede cerrar septiembre el 30 de septiembre: todavía queda el día.
    expect(fechaDeCierre("2026-09", 5)).toBe("2026-10-05")
  })

  it("si el día configurado no existe, usa el último del mes", () => {
    // Cerrar enero un día 31 cae en febrero. Pasar al 1 de marzo retrasaría el
    // cierre un mes entero, así que se corre al 28.
    expect(fechaDeCierre("2026-01", 31)).toBe("2026-02-28")
  })

  it("acota los días fuera de rango en vez de generar una fecha inválida", () => {
    expect(fechaDeCierre("2026-09", 0)).toBe("2026-10-01")
    expect(fechaDeCierre("2026-09", 99)).toBe("2026-10-31")
  })
})

describe("periodosPendientes", () => {
  const base = { diaDeCierre: 5, yaCerrados: [] as string[] }

  it("sin fecha de inicio no cierra nada", () => {
    // Es el estado de todas las agencias hoy. La contabilidad no arranca sola.
    expect(
      periodosPendientes({ ...base, hoy: "2026-10-06", fechaDeInicio: null })
    ).toEqual([])
  })

  it("no cierra el mes en curso", () => {
    expect(
      periodosPendientes({ ...base, hoy: "2026-09-20", fechaDeInicio: "2026-09-01" })
    ).toEqual([])
  })

  it("no cierra antes del día configurado", () => {
    expect(
      periodosPendientes({ ...base, hoy: "2026-10-04", fechaDeInicio: "2026-09-01" })
    ).toEqual([])
  })

  it("cierra el mes anterior el día configurado", () => {
    expect(
      periodosPendientes({ ...base, hoy: "2026-10-05", fechaDeInicio: "2026-09-01" })
    ).toEqual(["2026-09"])
  })

  it("se pone al día solo si el cron no corrió", () => {
    // El escenario que evita que tengamos que intervenir: nadie corrió nada
    // durante tres meses y la próxima corrida recupera todo.
    expect(
      periodosPendientes({ ...base, hoy: "2027-01-10", fechaDeInicio: "2026-09-01" })
    ).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"])
  })

  it("no repite lo que ya está cerrado", () => {
    expect(
      periodosPendientes({
        ...base,
        hoy: "2027-01-10",
        fechaDeInicio: "2026-09-01",
        yaCerrados: ["2026-09", "2026-11"],
      })
    ).toEqual(["2026-10", "2026-12"])
  })

  it("una agencia que activa el automático tarde recupera desde su fecha de inicio", () => {
    const r = periodosPendientes({ ...base, hoy: "2026-10-06", fechaDeInicio: "2026-06-15" })
    expect(r).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"])
  })

  it("el período de la fecha de inicio entra completo aunque arranque a mitad de mes", () => {
    // La fecha de inicio marca desde cuándo hay contabilidad, no parte un mes
    // al medio: el cierre de junio es el de junio.
    const r = periodosPendientes({ ...base, hoy: "2026-07-05", fechaDeInicio: "2026-06-15" })
    expect(r).toEqual(["2026-06"])
  })

  it("una agencia muy atrasada se pone al día de a tandas", () => {
    // Doscientos cierres en una sola corrida sería un problema operativo. Se
    // recupera de a poco, pero se recupera solo.
    const r = periodosPendientes({
      ...base,
      hoy: "2030-01-10",
      fechaDeInicio: "2020-01-01",
      maximo: 3,
    })
    expect(r).toEqual(["2020-01", "2020-02", "2020-03"])
  })

  it("una fecha de inicio absurda no cuelga el cron", () => {
    const r = periodosPendientes({
      ...base,
      hoy: "2026-10-06",
      fechaDeInicio: "1900-01-01",
      maximo: 2,
    })
    expect(r).toHaveLength(2)
  })
})

describe("puedeCerrar", () => {
  it("no se cierra un mes que todavía no terminó", () => {
    expect(puedeCerrar("2026-09", "2026-09-30", null).puede).toBe(false)
  })

  it("se puede cerrar apenas termina, sin esperar al día configurado", () => {
    // Un cierre manual anticipado es legítimo: el contador terminó antes.
    expect(puedeCerrar("2026-09", "2026-10-01", null).puede).toBe(true)
  })

  it("un período cerrado no se vuelve a cerrar", () => {
    const r = puedeCerrar("2026-09", "2026-10-10", "CLOSED")
    expect(r.puede).toBe(false)
    expect(r.motivo).toMatch(/reabrirlo/)
  })

  it("rechaza un período mal formado", () => {
    expect(puedeCerrar("2026-13", "2027-01-10", null).puede).toBe(false)
  })
})

describe("puedeRecalcular", () => {
  it("un período abierto admite recálculo", () => {
    // Sin esto, corregir una factura el día 3 obligaría a pedirnos ayuda.
    expect(puedeRecalcular("OPEN")).toBe(true)
    expect(puedeRecalcular(null)).toBe(true)
  })

  it("un período cerrado no", () => {
    expect(puedeRecalcular("CLOSED")).toBe(false)
  })
})
