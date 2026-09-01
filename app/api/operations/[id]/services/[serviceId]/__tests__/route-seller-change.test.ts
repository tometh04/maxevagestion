// app/api/operations/[id]/services/[serviceId]/__tests__/route-seller-change.test.ts
/**
 * @jest-environment node
 *
 * Cambiar quién comisiona un servicio ya cargado.
 *
 * Pedido de Yamil (Lozada): "estos servicios los comisiona Melani, no Julian".
 * Hasta ahora `seller_id` sólo se podía elegir en el alta —el selector estaba
 * gateado a `!editingServiceId` y el PATCH descartaba el campo en silencio— con
 * el argumento de que reasignarlo movería una comisión ya devengada. El
 * argumento vale sólo cuando esa comisión tiene plata atrás; para el resto era
 * una corrección normal que no había forma de hacer.
 *
 * Lo que fijan estos tests:
 *   1. El cambio mueve la fila `kind = 'SERVICE'` al nuevo vendedor, con SU
 *      porcentaje y sin tocarle el mes (`accrual_date`).
 *   2. Con la comisión trabada —pagada, con pago parcial o saldada— se rechaza
 *      con 409 y NO se escribe NADA: ni el servicio ni la comisión. El PATCH es
 *      todo o nada para estos campos, porque si el rechazo llegara después del
 *      UPDATE el usuario se quedaría con medio formulario guardado.
 *   3. Los gates de permisos son los mismos que en el alta.
 *   4. El switch "Comisiona" crea y borra la fila SERVICE.
 *   5. Nunca se toca una fila con `kind <> 'SERVICE'` (el barrido de huérfanas
 *      de `applyCommissionPlan` es lo que protege eso del otro lado).
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      return {
        status: init?.status ?? 200,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({
  canPerformAction: jest.fn(() => true),
  getUserAgencyIds: jest.fn(async () => ["agency-rosario"]),
  resolveOperationAccessScope: jest.fn(() => "full"),
  isAgencyReadonlyScope: jest.fn(() => false),
  isSellerWithinUserAgencies: jest.fn(async () => true),
}))
jest.mock("@/lib/commissions/calculate", () => ({
  // `isLocked` va de verdad: es justamente el predicado bajo prueba.
  isLocked: jest.requireActual("@/lib/commissions/calculate").isLocked,
  getSellerPercentage: jest.fn(async () => 20),
  recalculateOperationCommissions: jest.fn(async () => ({ plan: { entries: [] } })),
}))
jest.mock("@/lib/accounting/exchange-rates", () => ({ getExchangeRate: jest.fn(async () => 1000) }))
jest.mock("@/lib/accounting/operator-payment-settlement", () => ({
  getOpenOperatorPaymentStatus: jest.fn(async () => null),
}))
jest.mock("@/lib/settings/org-features", () => ({ getOrgFeatureFlag: jest.fn(async () => true) }))
jest.mock("@/lib/operations/recalc-guard", () => ({ shouldSkipOperatorModelRecalc: () => true }))

import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getSellerPercentage } from "@/lib/commissions/calculate"
import { isSellerWithinUserAgencies } from "@/lib/permissions-api"
import { PATCH } from "../route"

const ORG_ID = "org-lozada"
const AGENCY_ID = "agency-rosario"
const OPERATION_ID = "op-1111"
const SERVICE_ID = "svc-1111"
const JULIAN = "seller-julian"
const MELANI = "seller-melani"
const FOREIGN = "seller-de-otro-tenant"
const COMMISSION_ID = "comm-1111"

interface Recorded {
  table: string
  op: "select" | "insert" | "update" | "delete"
  payload?: any
  filters: Array<{ column: string; value: unknown }>
}

let recorded: Recorded[] = []

const OPERATION = {
  id: OPERATION_ID,
  seller_id: JULIAN,
  status: "CONFIRMED",
  agency_id: AGENCY_ID,
  file_code: "OP-001",
  destination: "Cancún",
  departure_date: "2026-12-01",
  sale_currency: "USD",
  currency: "USD",
}

const SERVICE = {
  id: SERVICE_ID,
  operation_id: OPERATION_ID,
  service_type: "ASSISTANCE",
  seller_id: JULIAN,
  generates_commission: true,
  sale_amount: 170,
  sale_currency: "USD",
  cost_amount: 137,
  cost_currency: "USD",
  commission_record_id: COMMISSION_ID,
  operator_id: null,
  operator_payment_id: null,
  ledger_income_id: null,
  ledger_expense_id: null,
}

/**
 * Datasets por tabla. El valor puede ser un array (se van consumiendo en orden
 * en llamadas sucesivas a la misma tabla) o un valor fijo.
 */
function buildSupabaseMock(datasets: Record<string, any>) {
  const cursors: Record<string, number> = {}

  return {
    from(table: string) {
      const entry: Recorded = { table, op: "select", filters: [] }
      recorded.push(entry)

      const builder: any = {
        select: () => builder,
        insert(payload: any) {
          entry.op = "insert"
          entry.payload = payload
          return builder
        },
        update(payload: any) {
          entry.op = "update"
          entry.payload = payload
          return builder
        },
        delete() {
          entry.op = "delete"
          return builder
        },
        eq(column: string, value: unknown) {
          entry.filters.push({ column, value })
          return builder
        },
        in: () => builder,
        is: () => builder,
        neq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: resolve(), error: null }),
        single: async () => ({ data: resolve(), error: null }),
        then: (onResolve: any) => onResolve({ data: resolve(), error: null }),
      }

      function resolve() {
        const value = datasets[table]
        if (Array.isArray(value)) {
          const i = cursors[table] ?? 0
          cursors[table] = i + 1
          return value[Math.min(i, value.length - 1)]
        }
        return value ?? null
      }

      return builder
    },
  }
}

function asUser(role = "ADMIN", extra: Record<string, unknown> = {}) {
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "user-yamil", org_id: ORG_ID, role, roles: [role], ...extra },
  })
}

function useSupabase(datasets: Record<string, any>) {
  ;(createServerClient as jest.Mock).mockResolvedValue(buildSupabaseMock(datasets))
}

function patch(body: any) {
  return PATCH({ json: async () => body } as any, {
    params: Promise.resolve({ id: OPERATION_ID, serviceId: SERVICE_ID }),
  } as any)
}

/** Igual que el default: sólo se cambia lo que cada test necesite. */
function defaultDatasets(overrides: Record<string, any> = {}) {
  return {
    operations: OPERATION,
    operation_services: [SERVICE, { ...SERVICE, seller_id: MELANI }],
    commission_records: {
      id: COMMISSION_ID,
      seller_id: JULIAN,
      status: "PENDING",
      amount_paid: 0,
      percentage: 13,
      settled_at: null,
    },
    users: { id: MELANI, role: "POST_VENTA", is_active: true, name: "Melani Zuttion" },
    financial_settings: { commission_service_types: ["ASSISTANCE", "SEAT"] },
    ...overrides,
  }
}

const writes = () => recorded.filter((r) => r.op !== "select")
const writesTo = (table: string) => writes().filter((r) => r.table === table)

beforeEach(() => {
  jest.clearAllMocks()
  recorded = []
  ;(getSellerPercentage as jest.Mock).mockResolvedValue(20)
  ;(isSellerWithinUserAgencies as jest.Mock).mockResolvedValue(true)
})

describe("PATCH — cambiar quién comisiona", () => {
  it("mueve la comisión del servicio al nuevo vendedor con SU porcentaje", async () => {
    asUser()
    useSupabase(defaultDatasets())

    const response = await patch({ seller_id: MELANI })
    expect(response.status).toBe(200)

    // El servicio queda a nombre de Melani.
    const serviceUpdate = writesTo("operation_services")[0]
    expect(serviceUpdate.payload.seller_id).toBe(MELANI)

    // Y la comisión también, con el porcentaje del NUEVO vendedor (20), no con
    // el que tenía guardado la fila (13): conservarlo le aplicaría al nuevo la
    // tasa del anterior.
    const commissionUpdate = writesTo("commission_records").find((w) => w.op === "update")
    expect(commissionUpdate).toBeDefined()
    expect(commissionUpdate!.payload.seller_id).toBe(MELANI)
    expect(commissionUpdate!.payload.percentage).toBe(20)
    expect(getSellerPercentage).toHaveBeenCalledWith(expect.anything(), ORG_ID, MELANI)
  })

  it("no le toca el mes a la comisión: el servicio se vendió cuando se vendió", async () => {
    asUser()
    useSupabase(defaultDatasets())

    await patch({ seller_id: MELANI })

    const commissionUpdate = writesTo("commission_records").find((w) => w.op === "update")!
    expect(commissionUpdate.payload).not.toHaveProperty("accrual_date")
    expect(commissionUpdate.payload).not.toHaveProperty("date_calculated")
  })

  it("nunca escribe sobre una fila que no sea kind = 'SERVICE'", async () => {
    asUser()
    useSupabase(defaultDatasets())

    await patch({ seller_id: MELANI })

    // Toda lectura/escritura de comisiones va filtrada por kind SERVICE: es lo
    // que evita pisar la comisión de la venta base del vendedor original.
    for (const call of recorded.filter((r) => r.table === "commission_records")) {
      const byId = call.filters.some((f) => f.column === "id")
      const byKind = call.filters.some((f) => f.column === "kind" && f.value === "SERVICE")
      expect(byId || byKind).toBe(true)
    }
  })

  it("un body con sólo seller_id es una edición válida", async () => {
    asUser()
    useSupabase(defaultDatasets())

    // Antes el PATCH cortaba con 400 "No se proporcionaron campos" porque
    // `seller_id` no está en la whitelist de campos editables.
    const response = await patch({ seller_id: MELANI })
    expect(response.status).toBe(200)
  })
})

describe("PATCH — comisión trabada", () => {
  const trabas = [
    ["ya pagada", { status: "PAID", amount_paid: 0, settled_at: null }],
    ["con pago parcial", { status: "PENDING", amount_paid: 10, settled_at: null }],
    ["saldada en un cierre", { status: "PENDING", amount_paid: 0, settled_at: "2026-08-01" }],
  ] as const

  it.each(trabas)("rechaza el cambio de vendedor si está %s", async (_label, estado) => {
    asUser()
    useSupabase(
      defaultDatasets({
        commission_records: {
          id: COMMISSION_ID,
          seller_id: JULIAN,
          percentage: 13,
          ...estado,
        },
        users: { id: JULIAN, name: "Julian Trovarelli", role: "SELLER", is_active: true },
      })
    )

    const response = await patch({ seller_id: MELANI, sale_amount: 999 })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe("SERVICE_COMMISSION_LOCKED")
    // El mensaje nombra a quién se le pagó: sin eso el usuario no sabe qué
    // pago tiene que anular.
    expect(body.error).toContain("Julian Trovarelli")
  })

  it("con la comisión trabada no se guarda NADA, ni siquiera el precio", async () => {
    asUser()
    useSupabase(
      defaultDatasets({
        commission_records: {
          id: COMMISSION_ID,
          seller_id: JULIAN,
          status: "PAID",
          amount_paid: 0,
          percentage: 13,
          settled_at: null,
        },
      })
    )

    // El mismo submit cambia el vendedor Y el precio: si el rechazo llegara
    // después del UPDATE, el precio quedaría guardado y el vendedor no.
    const response = await patch({ seller_id: MELANI, sale_amount: 999 })

    expect(response.status).toBe(409)
    expect(writes()).toHaveLength(0)
  })

  it("también rechaza apagar el switch de una comisión ya pagada", async () => {
    asUser()
    useSupabase(
      defaultDatasets({
        commission_records: {
          id: COMMISSION_ID,
          seller_id: JULIAN,
          status: "PAID",
          amount_paid: 0,
          percentage: 13,
          settled_at: null,
        },
      })
    )

    const response = await patch({ generates_commission: false })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain("No se puede quitar la comisión")
    expect(writes()).toHaveLength(0)
  })

  it("una comisión PENDING sin plata atrás sí se puede mover", async () => {
    asUser()
    useSupabase(defaultDatasets())

    const response = await patch({ seller_id: MELANI })
    expect(response.status).toBe(200)
  })
})

describe("PATCH — permisos al elegir vendedor", () => {
  it("no deja imputarle la comisión a alguien de otro tenant", async () => {
    asUser()
    // El lookup va filtrado por org_id, así que un usuario ajeno no aparece.
    useSupabase(defaultDatasets({ users: null }))

    const response = await patch({ seller_id: FOREIGN })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Vendedor inválido")
    expect(writes()).toHaveLength(0)
  })

  it("no deja elegir a un usuario inactivo", async () => {
    asUser()
    useSupabase(
      defaultDatasets({ users: { id: MELANI, role: "POST_VENTA", is_active: false } })
    )

    const response = await patch({ seller_id: MELANI })
    expect(response.status).toBe(400)
  })

  it("no deja elegir a alguien cuyo rol no puede figurar como vendedor", async () => {
    asUser()
    useSupabase(defaultDatasets({ users: { id: MELANI, role: "VIEWER", is_active: true } }))

    const response = await patch({ seller_id: MELANI })
    expect(response.status).toBe(400)
  })

  it("un SELLER no puede asignarle el servicio a alguien de otra agencia", async () => {
    asUser("SELLER")
    ;(isSellerWithinUserAgencies as jest.Mock).mockResolvedValue(false)
    useSupabase(defaultDatasets())

    const response = await patch({ seller_id: MELANI })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain("no pertenece a sus agencias")
  })

  it("un asesor independiente no puede desviarle la comisión a otro", async () => {
    asUser("SELLER", { is_independent_advisor: true })
    useSupabase(defaultDatasets())

    const response = await patch({ seller_id: MELANI })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain("No puede asignar el servicio a otro vendedor")
    expect(writes()).toHaveLength(0)
  })
})

describe("PATCH — switch Comisiona", () => {
  it("prenderlo sobre un servicio que no comisionaba crea la fila SERVICE", async () => {
    asUser()
    const seat = {
      ...SERVICE,
      service_type: "SEAT",
      generates_commission: false,
      seller_id: MELANI,
      commission_record_id: null,
      sale_amount: 390,
      cost_amount: 365.75,
    }
    useSupabase(
      defaultDatasets({
        operation_services: [seat, { ...seat, generates_commission: true }],
        commission_records: null,
      })
    )

    const response = await patch({ generates_commission: true })
    expect(response.status).toBe(200)

    const insert = writesTo("commission_records").find((w) => w.op === "insert")
    expect(insert).toBeDefined()
    expect(insert!.payload.kind).toBe("SERVICE")
    expect(insert!.payload.seller_id).toBe(MELANI)
    expect(insert!.payload.operation_service_id).toBe(SERVICE_ID)
    // 20% sobre el margen del asiento (390 − 365,75 = 24,25).
    expect(insert!.payload.amount).toBeCloseTo(4.85, 2)
  })

  it("apagarlo borra la fila SERVICE y desvincula el servicio", async () => {
    asUser()
    useSupabase(
      defaultDatasets({
        operation_services: [SERVICE, { ...SERVICE, generates_commission: false }],
      })
    )

    const response = await patch({ generates_commission: false })
    expect(response.status).toBe(200)

    expect(writesTo("commission_records").some((w) => w.op === "delete")).toBe(true)
    const unlink = writesTo("operation_services").find(
      (w) => w.op === "update" && w.payload?.commission_record_id === null
    )
    expect(unlink).toBeDefined()
  })

  it("el booleano explícito le gana al default de la oficina", async () => {
    asUser()
    // La oficina dice que el asiento comisiona, pero el usuario lo apaga para
    // este servicio puntual.
    const seat = { ...SERVICE, service_type: "VISA", generates_commission: false }
    useSupabase(
      defaultDatasets({
        operation_services: [seat, seat],
        commission_records: null,
        financial_settings: { commission_service_types: ["VISA"] },
      })
    )

    await patch({ service_type: "VISA", generates_commission: false })

    const serviceUpdate = writesTo("operation_services")[0]
    expect(serviceUpdate.payload.generates_commission).toBe(false)
  })

  it("sin booleano explícito, cambiar el tipo re-deriva del default de la oficina", async () => {
    asUser()
    const seat = { ...SERVICE, service_type: "ASSISTANCE", generates_commission: true }
    useSupabase(
      defaultDatasets({
        operation_services: [seat, { ...seat, service_type: "SEAT" }],
        // Esta oficina hace comisionar el asiento.
        financial_settings: { commission_service_types: ["ASSISTANCE", "SEAT"] },
      })
    )

    await patch({ service_type: "SEAT" })

    const serviceUpdate = writesTo("operation_services")[0]
    expect(serviceUpdate.payload.generates_commission).toBe(true)
  })

  it("una oficina que no hace comisionar el asiento lo deja sin comisión", async () => {
    asUser()
    const svc = { ...SERVICE, service_type: "ASSISTANCE", generates_commission: true }
    useSupabase(
      defaultDatasets({
        operation_services: [svc, { ...svc, service_type: "SEAT", generates_commission: false }],
        financial_settings: { commission_service_types: ["ASSISTANCE"] },
      })
    )

    await patch({ service_type: "SEAT" })

    const serviceUpdate = writesTo("operation_services")[0]
    expect(serviceUpdate.payload.generates_commission).toBe(false)
  })
})
