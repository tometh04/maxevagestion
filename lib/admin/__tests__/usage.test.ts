import {
  USAGE_MODULES,
  USAGE_RAMP,
  classifyUsage,
  daysSince,
  formatCount,
  formatLastSeen,
  heatLevel,
} from "../usage"

const NOW = new Date("2026-08-13T12:00:00Z")

describe("heatLevel", () => {
  it("devuelve 0 cuando no hubo actividad", () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(-1, 100)).toBe(0)
  })

  it("devuelve 0 si el maximo es 0 (matriz vacia, sin division por cero)", () => {
    expect(heatLevel(0, 0)).toBe(0)
    expect(heatLevel(5, 0)).toBe(0)
  })

  it("nunca pinta una celda con actividad como vacia", () => {
    // El caso que motiva la escala log: 1 evento contra un import de 6500 da
    // ratio ~0.001 en lineal y la celda se perderia contra el fondo.
    expect(heatLevel(1, 6500)).toBeGreaterThanOrEqual(1)
  })

  it("satura en 5 y no se sale de la rampa", () => {
    expect(heatLevel(6500, 6500)).toBe(5)
    expect(heatLevel(99999, 10)).toBe(5)
    for (const v of [0, 1, 7, 50, 900, 6500]) {
      expect(USAGE_RAMP[heatLevel(v, 6500)]).toBeDefined()
    }
  })

  it("es monotona: mas eventos nunca baja de nivel", () => {
    const values = [1, 5, 20, 100, 500, 2000, 6500]
    const levels = values.map((v) => heatLevel(v, 6500))
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1])
    }
  })

  it("ignora valores no finitos en vez de romper el render", () => {
    // Cae al nivel 0 (celda vacia) en vez de indexar fuera de la rampa.
    expect(heatLevel(NaN, 100)).toBe(0)
    expect(heatLevel(Infinity, 100)).toBe(0)
  })
})

describe("daysSince", () => {
  it("es null cuando nunca hubo evento", () => {
    expect(daysSince(null, NOW)).toBeNull()
  })

  it("no devuelve negativos si el evento es del futuro (clock skew)", () => {
    expect(daysSince("2026-08-20T12:00:00Z", NOW)).toBe(0)
  })

  it("cuenta dias enteros", () => {
    expect(daysSince("2026-08-13T00:00:00Z", NOW)).toBe(0)
    expect(daysSince("2026-08-11T12:00:00Z", NOW)).toBe(2)
  })

  it("tolera fechas invalidas", () => {
    expect(daysSince("no-es-una-fecha", NOW)).toBeNull()
  })
})

describe("classifyUsage", () => {
  it("distingue los cuatro estados", () => {
    expect(classifyUsage("2026-08-12T10:00:00Z", NOW).key).toBe("active")
    expect(classifyUsage("2026-08-05T10:00:00Z", NOW).key).toBe("cooling")
    expect(classifyUsage("2026-07-01T10:00:00Z", NOW).key).toBe("dormant")
    expect(classifyUsage(null, NOW).key).toBe("never")
  })

  it("corta en los bordes declarados (3 y 14 dias)", () => {
    expect(classifyUsage("2026-08-10T12:00:00Z", NOW).key).toBe("active") // 3 d
    expect(classifyUsage("2026-08-09T12:00:00Z", NOW).key).toBe("cooling") // 4 d
    expect(classifyUsage("2026-07-30T12:00:00Z", NOW).key).toBe("cooling") // 14 d
    expect(classifyUsage("2026-07-29T12:00:00Z", NOW).key).toBe("dormant") // 15 d
  })
})

describe("catalogo de modulos", () => {
  it("no tiene keys duplicadas", () => {
    const keys = USAGE_MODULES.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("no incluye `ingestion`: no es uso de la app", () => {
    expect(USAGE_MODULES.some((m) => (m.key as string) === "ingestion")).toBe(false)
  })

  it("tiene una rampa de 6 pasos, uno por nivel de heatLevel", () => {
    expect(USAGE_RAMP).toHaveLength(6)
  })
})

describe("formato", () => {
  it("abrevia miles sin perder legibilidad", () => {
    expect(formatCount(0)).toBe("0")
    expect(formatCount(999)).toBe("999")
    expect(formatCount(1500)).toBe("1.5k")
    expect(formatCount(2000)).toBe("2k")
    expect(formatCount(12345)).toBe("12k")
  })

  it("describe la ultima actividad en lenguaje corto", () => {
    expect(formatLastSeen(null, NOW)).toBe("—")
    expect(formatLastSeen("2026-08-13T09:00:00Z", NOW)).toBe("Hoy")
    expect(formatLastSeen("2026-08-12T09:00:00Z", NOW)).toBe("Ayer")
    expect(formatLastSeen("2026-08-03T09:00:00Z", NOW)).toBe("Hace 10 d")
  })
})
