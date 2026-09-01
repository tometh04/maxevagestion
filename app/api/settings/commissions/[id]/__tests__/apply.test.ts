/**
 * @jest-environment node
 *
 * Arrastrar una regla de comisión a lo ya calculado.
 *
 * Reporte de Yamil: "cambiamos las comisiones pero no impacta desde agosto como
 * pusimos". Cada `commission_record` guarda el porcentaje con el que nació, así
 * que cambiar la regla no movía nada.
 *
 * Lo que se fija acá es el ALCANCE, que es donde está el riesgo real. El
 * recálculo global que ya existía habría puesto el 45% de Santi también en
 * julio, porque `valid_from` responde "¿rige hoy?" y no "¿a qué operaciones les
 * toca". Medido cuando se reportó: 15 comisiones pendientes de Santi anteriores
 * a agosto, en el mes que se estaba por cerrar.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      return { status: init?.status ?? 200, json: async () => JSON.parse(body) }
    },
  },
}))

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/commissions/calculate", () => ({
  processCommissionsForOperations: jest.fn(async () => undefined),
}))
jest.mock("@/lib/accounting/audit", () => ({ logAccountingAction: jest.fn() }))

import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { processCommissionsForOperations } from "@/lib/commissions/calculate"
import { GET, POST } from "../apply/route"

const ORG_ID = "org-1111"
const SANTI = "seller-santi"
const RULE_ID = "rule-santi"

/** Filtros que recibió la consulta de commission_records. */
let filtrosRecords: Array<{ op: string; column: string; value: unknown }> = []

interface Escenario {
  rule?: any
  records?: any[]
  orgId?: string | null
  role?: string
}

const REGLA_SANTI = {
  id: RULE_ID,
  type: "SELLER",
  basis: "FIXED_PERCENTAGE",
  value: 45,
  seller_id: SANTI,
  valid_from: "2026-08-01",
  valid_to: null,
}

const pendiente = (percentage: number, operationId: string) => ({
  id: `rec-${operationId}-${percentage}`,
  operation_id: operationId,
  status: "PENDING",
  amount_paid: 0,
  settled_at: null,
  percentage,
})

function setup({ rule = REGLA_SANTI, records = [], orgId = ORG_ID, role = "ADMIN" }: Escenario = {}) {
  filtrosRecords = []

  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "u-1", org_id: orgId, role, roles: [role] },
  })
  ;(createServerClient as jest.Mock).mockResolvedValue({
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          if (table === "commission_records") filtrosRecords.push({ op: "eq", column, value })
          return builder
        },
        neq: (column: string, value: unknown) => {
          if (table === "commission_records") filtrosRecords.push({ op: "neq", column, value })
          return builder
        },
        // `.not(col, op, value)` — excluye varias clases de comisión de una.
        not: (column: string, op: string, value: unknown) => {
          if (table === "commission_records") {
            filtrosRecords.push({ op: `not.${op}`, column, value })
          }
          return builder
        },
        gte: (column: string, value: unknown) => {
          filtrosRecords.push({ op: "gte", column, value })
          return builder
        },
        lte: (column: string, value: unknown) => {
          filtrosRecords.push({ op: "lte", column, value })
          return builder
        },
        maybeSingle: async () => ({ data: rule, error: null }),
        then: (resolve: any) => resolve({ data: records, error: null }),
      }
      return builder
    },
  })
}

const params = { params: Promise.resolve({ id: RULE_ID }) }
const req = {} as any

beforeEach(() => jest.clearAllMocks())

describe("GET /api/settings/commissions/[id]/apply — alcance", () => {
  it("acota el período a la vigencia de la regla, no a todo", async () => {
    // Lo que evita repartirle a julio el porcentaje que se puso desde agosto.
    setup({ records: [pendiente(35, "op-1")] })
    await GET(req, params)

    expect(filtrosRecords).toContainEqual({ op: "gte", column: "accrual_date", value: "2026-08-01" })
    expect(filtrosRecords.some((f) => f.op === "lte" && f.column === "accrual_date")).toBe(false)
  })

  it("respeta la fecha de fin cuando la regla la tiene", async () => {
    setup({ rule: { ...REGLA_SANTI, valid_to: "2026-08-31" }, records: [] })
    await GET(req, params)

    expect(filtrosRecords).toContainEqual({ op: "lte", column: "accrual_date", value: "2026-08-31" })
  })

  it("mira accrual_date y no date_calculated", async () => {
    // date_calculated se reescribe en cada recálculo: el período se moveria solo.
    setup({ records: [] })
    await GET(req, params)

    expect(filtrosRecords.some((f) => f.column === "date_calculated")).toBe(false)
  })

  it("deja afuera las comisiones de servicios y las de ajuste", async () => {
    // Las escribe otro flujo con su propio porcentaje: recalcular la operación
    // no las toca, así que contarlas prometería un cambio que no va a pasar.
    // Las de ajuste por liquidación (VIB-174) tampoco salen del margen: son una
    // corrección puntual y arrastrar la regla no debería moverlas.
    setup({ records: [] })
    await GET(req, params)

    expect(filtrosRecords).toContainEqual({
      op: "not.in",
      column: "kind",
      value: "(SERVICE,ADJUSTMENT)",
    })
  })

  it("scopea por org y por el vendedor de la regla", async () => {
    setup({ records: [] })
    await GET(req, params)

    expect(filtrosRecords).toContainEqual({ op: "eq", column: "org_id", value: ORG_ID })
    expect(filtrosRecords).toContainEqual({ op: "eq", column: "seller_id", value: SANTI })
  })

  it("cuenta cuántas cambian y cuántas quedan afuera por estar pagadas", async () => {
    setup({
      records: [
        pendiente(35, "op-1"),
        pendiente(35, "op-2"),
        pendiente(45, "op-3"),
        { ...pendiente(35, "op-4"), status: "PAID", amount_paid: 100 },
      ],
    })
    const res: any = await GET(req, params)
    const body = await res.json()

    expect(body).toMatchObject({
      percentage: 45,
      aRecalcular: 3,
      bloqueadas: 1,
      yaEnElPorcentaje: 1,
    })
  })

  it("no arrastra la regla general de la organización", async () => {
    setup({ rule: { ...REGLA_SANTI, seller_id: null } })
    const res: any = await GET(req, params)

    expect(res.status).toBe(400)
  })

  it("no arrastra una regla de monto fijo", async () => {
    setup({ rule: { ...REGLA_SANTI, basis: "FIXED_AMOUNT" } })
    const res: any = await GET(req, params)

    expect(res.status).toBe(400)
  })

  it("una regla de otra org es 404", async () => {
    setup({ rule: null })
    const res: any = await GET(req, params)

    expect(res.status).toBe(404)
  })
})

describe("POST /api/settings/commissions/[id]/apply — aplicar", () => {
  it("recalcula sólo las operaciones del período, sin repetirlas", async () => {
    setup({
      records: [pendiente(35, "op-1"), pendiente(35, "op-1"), pendiente(35, "op-2")],
    })
    await POST(req, params)

    expect(processCommissionsForOperations).toHaveBeenCalledWith(["op-1", "op-2"], ORG_ID)
  })

  it("no llama al recálculo si no hay nada en el período", async () => {
    setup({ records: [] })
    const res: any = await POST(req, params)
    const body = await res.json()

    expect(processCommissionsForOperations).not.toHaveBeenCalled()
    expect(body.actualizadas).toBe(0)
  })

  it("deja rastro en la auditoría de un cambio de comisiones", async () => {
    setup({ records: [pendiente(35, "op-1")] })
    await POST(req, params)

    const { logAccountingAction } = require("@/lib/accounting/audit")
    expect(logAccountingAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE_COMMISSION", entityId: RULE_ID })
    )
  })

  it("un VIEWER no puede arrastrar comisiones", async () => {
    setup({ role: "VIEWER", records: [pendiente(35, "op-1")] })
    const res: any = await POST(req, params)

    expect(res.status).toBe(403)
    expect(processCommissionsForOperations).not.toHaveBeenCalled()
  })

  it("un usuario sin organización no puede", async () => {
    setup({ orgId: null, records: [] })
    const res: any = await POST(req, params)

    expect(res.status).toBe(400)
  })
})
