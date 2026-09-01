// app/api/operations/[id]/services/[serviceId]/__tests__/route-commission-double-count.test.ts
/**
 * @jest-environment node
 *
 * Doble pago de la comisión de un servicio.
 *
 * En las operaciones del "modelo servicio" (sin filas en `operation_operators`)
 * y con la flag `include_services_in_sale_total` APAGADA, editar un servicio
 * pisa los totales de la operación con la suma de sus servicios. A partir de
 * ahí `margin_amount` INCLUYE el margen de cada servicio, y la comisión base del
 * vendedor de la operación se recalcula sobre ese margen — mientras la fila
 * `kind = 'SERVICE'` de ese mismo margen sigue viva. La misma ganancia se paga
 * dos veces: una al vendedor de la operación y otra al del servicio.
 *
 * Hoy está dormido porque las dos orgs con ops de ese modelo tienen la flag
 * prendida, y ese es el primer guard de la función. Pero hacer configurables los
 * tipos que comisionan sube la apuesta: sólo en Lozada hay 18 asientos, 30
 * equipajes y 30 visas esperando a volverse comisionables.
 *
 * El arreglo NO toca los totales —los leen la deuda del cliente, los reportes y
 * el estado de cuenta— sino sólo la BASE con la que se recalcula la comisión.
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
jest.mock("@/lib/permissions-api", () => ({
  canPerformAction: jest.fn(() => true),
  getUserAgencyIds: jest.fn(async () => ["agency-rosario"]),
  resolveOperationAccessScope: jest.fn(() => "full"),
  isAgencyReadonlyScope: jest.fn(() => false),
  isSellerWithinUserAgencies: jest.fn(async () => true),
}))
jest.mock("@/lib/commissions/calculate", () => ({
  isLocked: jest.requireActual("@/lib/commissions/calculate").isLocked,
  getSellerPercentage: jest.fn(async () => 20),
  recalculateOperationCommissions: jest.fn(async () => ({ plan: { entries: [] } })),
}))
jest.mock("@/lib/accounting/exchange-rates", () => ({ getExchangeRate: jest.fn(async () => 1000) }))
jest.mock("@/lib/accounting/operator-payment-settlement", () => ({
  getOpenOperatorPaymentStatus: jest.fn(async () => null),
}))
// Flag APAGADA: es el único camino donde el doble conteo puede ocurrir.
jest.mock("@/lib/settings/org-features", () => ({ getOrgFeatureFlag: jest.fn(async () => false) }))

import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { recalculateOperationCommissions } from "@/lib/commissions/calculate"
import { PATCH } from "../route"

const ORG_ID = "org-1"
const OPERATION_ID = "op-1"
const SERVICE_ID = "svc-1"
const SELLER_ID = "seller-1"

/**
 * Operación del modelo servicio: un paquete base de 1.000 (margen 400) más una
 * asistencia comisionable de 170 (margen 33). Con la flag apagada, los totales
 * se recalculan como la suma de los servicios.
 */
const SERVICES = [
  {
    sale_amount: 1000,
    sale_currency: "USD",
    cost_amount: 600,
    cost_currency: "USD",
    generates_commission: false,
  },
  {
    sale_amount: 170,
    sale_currency: "USD",
    cost_amount: 137,
    cost_currency: "USD",
    generates_commission: true,
  },
]

const MARGEN_TOTAL = 1170 - 737 // 433
const MARGEN_DEL_SERVICIO = 170 - 137 // 33

let operationsUpdate: any = null

function buildSupabaseMock() {
  const cursors: Record<string, number> = {}

  const datasets: Record<string, any> = {
    operations: [
      // 1) guard de acceso del PATCH
      {
        id: OPERATION_ID,
        seller_id: SELLER_ID,
        status: "CONFIRMED",
        agency_id: "agency-rosario",
        file_code: "OP-1",
        destination: "Cancún",
        departure_date: "2026-12-01",
        sale_currency: "USD",
        currency: "USD",
      },
      // 2) monedas + org, dentro de recalculateOperationTotals
      {
        sale_currency: "USD",
        operator_cost_currency: "USD",
        currency: "USD",
        org_id: ORG_ID,
      },
      // 3) la operación ya con los totales pisados desde los servicios
      {
        id: OPERATION_ID,
        org_id: ORG_ID,
        agency_id: "agency-rosario",
        operation_date: "2026-08-01",
        seller_id: SELLER_ID,
        seller_secondary_id: null,
        commission_pct_primary: null,
        commission_pct_secondary: null,
        commission_split_mode: "AUTO",
        margin_amount: MARGEN_TOTAL,
      },
    ],
    operation_services: [
      {
        id: SERVICE_ID,
        operation_id: OPERATION_ID,
        service_type: "ASSISTANCE",
        seller_id: SELLER_ID,
        generates_commission: true,
        sale_amount: 170,
        sale_currency: "USD",
        cost_amount: 137,
        cost_currency: "USD",
        commission_record_id: null,
        operator_id: null,
        operator_payment_id: null,
        ledger_income_id: null,
        ledger_expense_id: null,
      },
      // el servicio ya actualizado (respuesta del update)
      {
        id: SERVICE_ID,
        seller_id: SELLER_ID,
        generates_commission: true,
        sale_amount: 175,
        sale_currency: "USD",
        cost_amount: 137,
        cost_currency: "USD",
      },
      // la lista completa que suma recalculateOperationTotals
      SERVICES,
    ],
    commission_records: null,
    users: null,
    financial_settings: null,
  }

  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        insert: () => builder,
        update(payload: any) {
          if (table === "operations") operationsUpdate = payload
          return builder
        },
        delete: () => builder,
        eq: () => builder,
        in: () => builder,
        is: () => builder,
        neq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: next(), error: null }),
        single: async () => ({ data: next(), error: null }),
        // El conteo de operadores: 0 → la op usa el modelo servicio.
        then: (onResolve: any) =>
          onResolve(
            table === "operation_operators"
              ? { data: [], count: 0, error: null }
              : { data: next(), error: null }
          ),
      }

      function next() {
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

beforeEach(() => {
  jest.clearAllMocks()
  operationsUpdate = null
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "user-1", org_id: ORG_ID, role: "ADMIN", roles: ["ADMIN"] },
  })
  ;(createServerClient as jest.Mock).mockResolvedValue(buildSupabaseMock())
})

describe("recalculateOperationTotals — base de comisión", () => {
  it("descuenta de la base lo que ya se paga por la comisión del servicio", async () => {
    const response = await PATCH({ json: async () => ({ sale_amount: 175 }) } as any, {
      params: Promise.resolve({ id: OPERATION_ID, serviceId: SERVICE_ID }),
    } as any)

    expect(response.status).toBe(200)
    expect(recalculateOperationCommissions).toHaveBeenCalled()

    const [, operation] = (recalculateOperationCommissions as jest.Mock).mock.calls[0]
    expect(operation.margin_amount).toBeCloseTo(MARGEN_TOTAL - MARGEN_DEL_SERVICIO, 2)
  })

  it("los totales de la operación siguen siendo los reales", () => {
    // El descuento es sólo de la base de comisión: `margin_amount` en la tabla
    // tiene que seguir siendo la ganancia real, porque la leen la deuda del
    // cliente, los reportes y el estado de cuenta.
    return PATCH({ json: async () => ({ sale_amount: 175 }) } as any, {
      params: Promise.resolve({ id: OPERATION_ID, serviceId: SERVICE_ID }),
    } as any).then(() => {
      expect(operationsUpdate).not.toBeNull()
      expect(operationsUpdate.margin_amount).toBeCloseTo(MARGEN_TOTAL, 2)
      expect(operationsUpdate.sale_amount_total).toBeCloseTo(1170, 2)
      expect(operationsUpdate.operator_cost).toBeCloseTo(737, 2)
    })
  })
})
