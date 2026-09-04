// app/api/operations/[id]/__tests__/route-delete-quotation.test.ts
/**
 * @jest-environment node
 *
 * DELETE de una operación creada desde una cotización.
 *
 * Hasta el 2026-09-04 era imposible borrarla: la FK del seguimiento de la
 * reserva con el proveedor estaba en RESTRICT y el guard de cotizaciones
 * rechazaba que la cascada desvinculara la operación. El usuario sólo veía
 * "Error al eliminar operación".
 *
 * Lo que se fija acá es el criterio de la ruta: no se borra si el proveedor ya
 * tomó la reserva, y si se borra, la cotización vuelve a quedar convertible.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => JSON.parse(JSON.stringify(data)),
    }),
  },
}))

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn(), createAdminClient: jest.fn() }))
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(), getClientIP: () => null }))
// Sincrónico a propósito: la ruta no lo await-ea, así que una promesa acá
// (aunque resuelva null) es truthy y corta el request.
jest.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: jest.fn(() => null) }))
jest.mock("@/lib/cache", () => ({ revalidateTag: jest.fn(), CACHE_TAGS: { DASHBOARD: "dashboard" } }))
jest.mock("@/lib/accounting/iva", () => ({
  updateSaleIVA: jest.fn(),
  updatePurchaseIVA: jest.fn(),
  deleteSaleIVA: jest.fn(),
  deletePurchaseIVA: jest.fn(),
  createPurchaseIVA: jest.fn(),
}))
jest.mock("@/lib/accounting/ledger", () => ({ invalidateBalanceCache: jest.fn() }))
jest.mock("@/lib/accounting/payment-cleanup", () => ({
  limpiarAsientosVaciosDeOperacion: jest.fn(async () => ({ errors: [] })),
}))
jest.mock("@/lib/accounting/operator-payments", () => ({
  createOperatorPayment: jest.fn(),
  calculateDueDate: jest.fn(),
  sanitizeDueDate: (v: any) => v ?? null,
}))
jest.mock("@/lib/accounting/operator-payment-settlement", () => ({
  getOpenOperatorPaymentStatus: jest.fn(async () => null),
}))
jest.mock("@/lib/documents/operation-documents", () => ({ getOperationVisibleDocuments: jest.fn(async () => []) }))
jest.mock("@/lib/operations/operation-financials", () => ({
  sumOperationOperatorCosts: (rows: any[]) => rows.reduce((s, r) => s + Number(r.cost || 0), 0),
}))

import { DELETE } from "../route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")

const OPERATION_ID = "96c1ca75-e37b-4737-a824-c6c6019fbf06"
const QUOTATION_ID = "f9054fd3-4bcd-481c-a4f6-9f2a5fff38b5"
const ORG_ID = "org-1"

interface MockState {
  bookingStatus: string | null
  operationDeleted: boolean
  quotationUpdates: any[]
}

function chain(result: any) {
  const builder: any = {
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    single: async () => result,
    maybeSingle: async () => result,
  }
  for (const m of ["select", "eq", "in", "is", "not", "order", "limit", "gte", "lte"]) builder[m] = () => builder
  return builder
}

function mockSupabase(state: MockState) {
  return {
    rpc: jest.fn(async () => ({ error: null })),
    from: (table: string) => {
      if (table === "operations") {
        return {
          select: () =>
            chain({
              data: { id: OPERATION_ID, org_id: ORG_ID, file_code: "OP-1", status: "RESERVED", lead_id: null },
              error: null,
            }),
          delete: () => {
            state.operationDeleted = true
            return chain({ data: null, error: null })
          },
        }
      }
      if (table === "quotation_provider_bookings") {
        return {
          select: () =>
            chain({
              data: state.bookingStatus ? [{ id: "qpb-1", status: state.bookingStatus }] : [],
              error: null,
            }),
        }
      }
      if (table === "quotations") {
        return {
          select: () => chain({ data: [{ id: QUOTATION_ID }], error: null }),
          update: (payload: any) => {
            state.quotationUpdates.push(payload)
            return chain({ data: null, error: null })
          },
        }
      }
      return {
        select: () => chain({ data: [], error: null }),
        insert: () => chain({ data: null, error: null }),
        update: () => chain({ data: null, error: null }),
        delete: () => chain({ data: null, error: null }),
      }
    },
  }
}

describe("DELETE /api/operations/[id] — operación creada desde una cotización", () => {
  const params = { params: Promise.resolve({ id: OPERATION_ID }) }
  const request = {} as unknown as Request
  let state: MockState

  beforeEach(() => {
    jest.clearAllMocks()
    state = { bookingStatus: "QUEUED", operationDeleted: false, quotationUpdates: [] }
    getCurrentUser.mockResolvedValue({
      user: { id: "u-1", email: "a@test.com", org_id: ORG_ID, role: "ADMIN" },
    })
    createServerClient.mockResolvedValue(mockSupabase(state))
  })

  it("no borra la operación si el proveedor ya tomó la reserva", async () => {
    state.bookingStatus = "CONFIRMED"

    const response: any = await DELETE(request, params as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(state.operationDeleted).toBe(false)
    expect(body.error).toContain("reserva con el proveedor está tomada")
  })

  it("borra la operación y devuelve la cotización a APPROVED", async () => {
    const response: any = await DELETE(request, params as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(state.operationDeleted).toBe(true)
    expect(state.quotationUpdates).toEqual([{ status: "APPROVED", converted_at: null }])
  })
})
