/**
 * @jest-environment node
 *
 * Ajuste de liquidación de operador — VIB-174.
 *
 * Lo que se fija acá es el criterio de la ruta, no el CRUD: la aritmética del
 * reparto tiene sus propios tests en `lib/accounting/__tests__`, y la
 * atomicidad la garantiza la RPC. Lo que puede romperse en esta capa es que se
 * escriba un ajuste sin permiso, que el reparto lo mande el cliente en vez de
 * calcularlo el servidor, o que un ajuste en dólares se asiente sin cotización.
 */

import { POST } from "@/app/api/accounting/operator-payments/[id]/adjust/route"
import { getRequestPermissions } from "@/lib/permissions/request"
import { loadOperatorCostAdjustmentContext } from "@/lib/accounting/operator-cost-adjustment-context"
import { getExchangeRate } from "@/lib/accounting/exchange-rates"

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/accounting/operator-cost-adjustment-context", () => ({
  ...jest.requireActual("@/lib/accounting/operator-cost-adjustment-context"),
  loadOperatorCostAdjustmentContext: jest.fn(),
}))
jest.mock("@/lib/accounting/exchange-rates", () => ({ getExchangeRate: jest.fn() }))

const DEBT_ID = "8f7c5213-6899-4170-8d17-a5a21608e5bb"
const params = Promise.resolve({ id: DEBT_ID })

/** Argumentos con los que se llamó a la RPC en el último request. */
let rpcArgs: any = null

function setup({
  role = "ADMIN",
  orgId = "org-1" as string | null,
  currency = "ARS" as "ARS" | "USD",
  commissions = [{ sellerId: "juan", percentage: 20, kind: "SELLER" }],
  splitWithSeller = true,
  operationStatus = "CONFIRMED" as string | null,
  rate = 1000 as number | null,
} = {}) {
  rpcArgs = null

  const supabase: any = {
    rpc: jest.fn(async (_fn: string, args: any) => {
      rpcArgs = args
      return { data: { adjustment_id: "adj-1", result_amount: -50 }, error: null }
    }),
    from: () => ({ select: () => ({ eq: function () { return this } }) }),
  }

  ;(getRequestPermissions as jest.Mock).mockResolvedValue({
    user: { id: "u-1", role, org_id: orgId },
    supabase,
    matrix: null,
  })

  ;(loadOperatorCostAdjustmentContext as jest.Mock).mockResolvedValue({
    debt: {
      id: DEBT_ID,
      operationId: "op-1",
      operatorName: "Eurovips",
      amount: 1550,
      paidAmount: 0,
      currency,
      status: "PENDING",
    },
    agencyId: "ag-1",
    operationDate: "2026-03-10",
    operationStatus,
    operationFileCode: "OP-1",
    operationDestination: "Cancún",
    commissions,
    referral: null,
    baseConfig: null,
    splitWithSeller,
  })

  ;(getExchangeRate as jest.Mock).mockResolvedValue(rate)
}

function request(body: Record<string, any>) {
  return new Request("http://localhost/api/accounting/operator-payments/x/adjust", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

const validBody = { actual_amount: 1600, reason: "Liquidación final de Eurovips" }

describe("POST /adjust — quién puede", () => {
  it("un vendedor no puede ajustar una deuda", async () => {
    setup({ role: "SELLER" })
    const res = await POST(request(validBody), { params })
    expect(res.status).toBe(403)
  })

  it("un usuario sin organización tampoco", async () => {
    setup({ orgId: null })
    const res = await POST(request(validBody), { params })
    expect(res.status).toBe(400)
  })

  it("un contable sí", async () => {
    setup({ role: "CONTABLE" })
    const res = await POST(request(validBody), { params })
    expect(res.status).toBe(200)
  })
})

describe("POST /adjust — validación", () => {
  it("exige motivo: un ajuste sin explicación no se puede auditar", async () => {
    setup()
    const res = await POST(request({ actual_amount: 1600, reason: "   " }), { params })
    expect(res.status).toBe(400)
  })

  it("rechaza un costo real igual a la deuda: no hay nada que ajustar", async () => {
    setup()
    const res = await POST(request({ actual_amount: 1550, reason: "x" }), { params })
    expect(res.status).toBe(400)
  })

  it("no ajusta la deuda de una operación cancelada", async () => {
    setup({ operationStatus: "CANCELLED" })
    const res = await POST(request(validBody), { params })
    expect(res.status).toBe(409)
  })
})

describe("POST /adjust — el reparto lo calcula el servidor", () => {
  it("ignora cualquier reparto que mande el cliente", async () => {
    // Si el reparto viniera del body, un cliente podría dejarle toda la pérdida
    // a la agencia —o toda al vendedor— sin que nadie lo note.
    setup()
    await POST(
      request({ ...validBody, seller_shares: [{ seller_id: "juan", amount: 999 }], agency_share: 0 }),
      { params },
    )

    expect(rpcArgs.p_seller_shares).toEqual([
      { seller_id: "juan", percentage: 20, amount: -10 },
    ])
    expect(rpcArgs.p_agency_share).toBe(-40)
  })

  it("con el reparto apagado la diferencia queda entera en la agencia", async () => {
    setup({ splitWithSeller: false })
    await POST(request(validBody), { params })

    expect(rpcArgs.p_seller_shares).toEqual([])
    expect(rpcArgs.p_agency_share).toBe(-50)
  })

  it("manda el estado que vio el cliente para que la RPC detecte un pago concurrente", async () => {
    setup()
    await POST(request(validBody), { params })

    expect(rpcArgs.p_expected_amount).toBe(1550)
    expect(rpcArgs.p_expected_paid_amount).toBe(0)
  })
})

describe("POST /adjust — deuda en dólares", () => {
  it("sin cotización cargada no asienta nada: no se valúa con un número inventado", async () => {
    setup({ currency: "USD", rate: null })
    const res = await POST(request(validBody), { params })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/cotización/i)
    expect(rpcArgs).toBeNull()
  })

  it("con cotización la pasa a la RPC", async () => {
    setup({ currency: "USD", rate: 1450 })
    await POST(request(validBody), { params })

    expect(rpcArgs.p_exchange_rate).toBe(1450)
  })
})
