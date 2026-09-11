// app/api/cash/export/__tests__/route.test.ts
/**
 * @jest-environment node
 *
 * VIB-146 — "poder descargar los movimientos de las cajas para conciliar".
 *
 * El botón ya existía; el archivo era el problema. Se armaba con "," como
 * separador, sin BOM y sin `sep=;`, o sea el formato que Excel en español
 * (Argentina) abre con todas las columnas amontonadas en la celda A. Mismo bug
 * que ya se había arreglado en `/api/operations/export-csv` y que quedó sin
 * arreglar acá. Ver también el incidente de encoding de VIB-118: los CSV de
 * este repo tienen que asumir Excel-ES.
 *
 * Y para conciliar de verdad faltaba la cuenta de cada movimiento, el signo del
 * egreso y un saldo acumulado.
 */

jest.mock("next/server", () => {
  class MockNextResponse {
    body: string
    status: number
    headers: Record<string, string>

    constructor(body: string, init?: { headers?: Record<string, string>; status?: number }) {
      this.body = body
      this.status = init?.status ?? 200
      this.headers = init?.headers ?? {}
    }

    static json(data: unknown, init?: { status?: number }) {
      const res = new MockNextResponse(JSON.stringify(data), init)
      ;(res as any).json = async () => JSON.parse(res.body)
      return res
    }

    async text() {
      return this.body
    }
  }
  return { NextResponse: MockNextResponse }
})

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/utils/date-range", () => ({
  startOfDayAR: (d: string) => `${d}T00:00:00-03:00`,
  endOfDayAR: (d: string) => `${d}T23:59:59-03:00`,
}))

import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { GET } from "../route"

const ORG_ID = "org-1"

function movement(over: Record<string, any> = {}) {
  return {
    id: "m1",
    movement_date: "2026-08-01T12:00:00+00:00",
    type: "INCOME",
    category: "COBRO",
    amount: 1234.5,
    currency: "ARS",
    notes: "",
    financial_accounts: { name: "Caja Pesos", currency: "ARS" },
    users: { name: "Yamil" },
    operations: { destination: "Cancún", agencies: { name: "Rosario" } },
    ...over,
  }
}

function useMovements(rows: any[]) {
  ;(createServerClient as jest.Mock).mockResolvedValue({
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        lte: () => builder,
        limit: async () => ({ data: [], error: null }),
        order: () => builder,
        // El export pagina con .range(): devuelve esta única página, que al
        // venir corta (< 1000) corta el bucle.
        range: () => builder,
        then: (resolve: any) => resolve({ data: rows, error: null }),
      }
      return builder
    },
  })
}

async function exportCsv(url = "https://test.local/api/cash/export"): Promise<string> {
  const response: any = await GET({ url } as any)
  return response.body as string
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "u1", org_id: ORG_ID, role: "ADMIN" },
  })
})

describe("GET /api/cash/export — formato Excel-ES (VIB-146)", () => {
  it("abre bien en Excel-ES: BOM, directiva sep=; y punto y coma", async () => {
    useMovements([movement()])
    const csv = await exportCsv()

    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toContain("sep=;\r\n")
    expect(csv).toContain("Fecha;Cuenta;Tipo")
  })

  it("no usa coma como separador de columnas (era el bug)", async () => {
    useMovements([movement()])
    const csv = await exportCsv()

    const headerLine = csv.split("\r\n")[1]
    expect(headerLine).not.toContain(",")
    expect(headerLine.split(";").length).toBe(11)
  })

  it("usa CRLF, que es lo que espera Excel en Windows", async () => {
    useMovements([movement(), movement({ id: "m2" })])
    const csv = await exportCsv()

    expect(csv).toContain("\r\n")
    expect(csv.split("\r\n").length).toBeGreaterThan(3)
  })

  it("escribe los montos con coma decimal", async () => {
    useMovements([movement({ amount: 1234.5 })])
    const csv = await exportCsv()

    expect(csv).toContain("1234,50")
    expect(csv).not.toContain("1234.50")
  })

  it("formatea la fecha como dd/MM/yyyy", async () => {
    useMovements([movement({ movement_date: "2026-08-01T12:00:00+00:00" })])
    const csv = await exportCsv()

    expect(csv).toContain("01/08/2026")
  })
})

describe("GET /api/cash/export — datos para conciliar", () => {
  it("incluye la cuenta de cada movimiento", async () => {
    useMovements([movement({ financial_accounts: { name: "Banco Galicia", currency: "ARS" } })])
    const csv = await exportCsv()

    expect(csv).toContain("Banco Galicia")
  })

  it("dice 'Sin cuenta' en vez de dejar la celda vacia", async () => {
    useMovements([movement({ financial_accounts: null })])
    const csv = await exportCsv()

    expect(csv).toContain("Sin cuenta")
  })

  it("los egresos van en negativo", async () => {
    useMovements([movement({ type: "EXPENSE", amount: 500 })])
    const csv = await exportCsv()

    expect(csv).toContain("-500,00")
  })

  it("acumula el saldo en el orden de los movimientos", async () => {
    useMovements([
      movement({ id: "m1", amount: 1000, type: "INCOME" }),
      movement({ id: "m2", amount: 300, type: "EXPENSE" }),
      movement({ id: "m3", amount: 50, type: "INCOME" }),
    ])
    const csv = await exportCsv()
    const dataLines = csv.split("\r\n").slice(2)

    // Columna 7 (indice 6) = Saldo acumulado.
    expect(dataLines[0].split(";")[6]).toBe("1000,00")
    expect(dataLines[1].split(";")[6]).toBe("700,00")
    expect(dataLines[2].split(";")[6]).toBe("750,00")
  })

  it("lleva un saldo separado por cuenta y por moneda", async () => {
    useMovements([
      movement({ id: "m1", amount: 1000, financial_accounts: { name: "Caja Pesos" }, currency: "ARS" }),
      movement({ id: "m2", amount: 200, financial_accounts: { name: "Caja USD" }, currency: "USD" }),
      movement({ id: "m3", amount: 500, financial_accounts: { name: "Caja Pesos" }, currency: "ARS" }),
    ])
    const csv = await exportCsv()
    const dataLines = csv.split("\r\n").slice(2)

    expect(dataLines[0].split(";")[6]).toBe("1000,00")
    // La cuenta en USD arranca su propio acumulado, no continua el de pesos.
    expect(dataLines[1].split(";")[6]).toBe("200,00")
    expect(dataLines[2].split(";")[6]).toBe("1500,00")
  })

  it("escapa las notas que traen punto y coma sin romper las columnas", async () => {
    useMovements([movement({ notes: 'Pago parcial; resto en efectivo' })])
    const csv = await exportCsv()
    const dataLine = csv.split("\r\n")[2]

    expect(dataLine).toContain('"Pago parcial; resto en efectivo"')
    expect(dataLine.split(";").length).toBe(12) // 11 columnas + el ; dentro de la nota entrecomillada
  })
})

describe("GET /api/cash/export — bordes", () => {
  it("sin movimientos devuelve igual un archivo valido con encabezados", async () => {
    useMovements([])
    const csv = await exportCsv()

    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toContain("Fecha;Cuenta;Tipo")
  })

  it("rechaza al usuario sin organizacion", async () => {
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: { id: "u1", org_id: null, role: "ADMIN" } })
    useMovements([])

    const response: any = await GET({ url: "https://test.local/x" } as any)

    expect(response.status).toBe(400)
  })
})

describe("GET /api/cash/export — oficina del movimiento", () => {
  it("usa la oficina del movimiento, no la de la operacion", async () => {
    // El gasto de agencia no cuelga de ninguna venta: la unica oficina que
    // tiene es la suya. Antes se leia `operations.agencies.name` y la columna
    // salia vacia para los 843 movimientos sin operacion.
    useMovements([movement({ agencies: { name: "Rosario" }, operations: null })])
    const csv = await exportCsv()

    expect(csv.split("\r\n")[2].split(";")[7]).toBe("Rosario")
  })

  it("cae a la oficina de la operacion si el movimiento no la tiene", async () => {
    useMovements([
      movement({ agencies: null, operations: { destination: "Cancún", agencies: { name: "Madero" } } }),
    ])
    const csv = await exportCsv()

    expect(csv.split("\r\n")[2].split(";")[7]).toBe("Madero")
  })

  it("cuando difieren manda la del movimiento: la plata se movio ahi", async () => {
    // Pasa de verdad en produccion (5 movimientos): una venta de Madero cobrada
    // en una cuenta de Rosario. En Caja interesa donde entro la plata.
    useMovements([
      movement({ agencies: { name: "Rosario" }, operations: { destination: "Cancún", agencies: { name: "Madero" } } }),
    ])
    const csv = await exportCsv()

    expect(csv.split("\r\n")[2].split(";")[7]).toBe("Rosario")
  })
})

/**
 * VIB-195 — el export cortaba en silencio.
 *
 * La query se ejecutaba con `await query`, sin `.limit()` ni `.range()`, así
 * que PostgREST devolvía su máximo por defecto (1000 filas) y nada lo decía.
 * En la agencia más grande eso era una fracción de la caja presentada como el
 * archivo completo, y el "Saldo acumulado" —que se calcula sobre las filas
 * traídas— tampoco cerraba contra el extracto.
 */
describe("GET /api/cash/export — no corta en la primera página", () => {
  /** Devuelve `total` movimientos repartidos en páginas de 1000. */
  function usePagedMovements(total: number) {
    const pedidos: Array<[number, number]> = []
    ;(createServerClient as jest.Mock).mockResolvedValue({
      from: () => {
        let desde = 0
        let hasta = 999
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          gte: () => builder,
          lte: () => builder,
          limit: async () => ({ data: [], error: null }),
          order: () => builder,
          range: (from: number, to: number) => {
            desde = from
            hasta = to
            pedidos.push([from, to])
            return builder
          },
          then: (resolve: any) => {
            const data = []
            for (let i = desde; i <= Math.min(hasta, total - 1); i++) {
              data.push(movement({ id: `m${i}`, amount: 1 }))
            }
            return resolve({ data, error: null })
          },
        }
        return builder
      },
    })
    return pedidos
  }

  it("pide la página siguiente cuando la primera vino completa", async () => {
    const pedidos = usePagedMovements(1500)
    const csv = await exportCsv()

    // Dos páginas pedidas, no una.
    expect(pedidos.slice(0, 2)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    // 1500 movimientos + encabezado + directiva sep=;
    expect(csv.split("\r\n").length).toBe(1502)
  })

  it("no pide otra página cuando la primera vino corta", async () => {
    const pedidos = usePagedMovements(3)
    await exportCsv()

    expect(pedidos).toEqual([[0, 999]])
  })
})
