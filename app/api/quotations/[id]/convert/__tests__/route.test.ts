/** @jest-environment node */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}))

import { getCurrentUser } from "@/lib/auth"
import { checkLimit } from "@/lib/billing/limits"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { convertQuotationToOperation } from "@/lib/quotations/conversion"
import {
  captureQuotationCommissionSnapshot,
  ensureQuotationCommissionReviewAlert,
  processQuotationConversionEffects,
} from "@/lib/quotations/conversion-effects"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { bookingItemsFromQuotation, enqueueProviderBooking } from "@/lib/provider-booking/booking"
import { POST } from "../route"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/billing/limits", () => ({ checkLimit: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({
  ...jest.requireActual("@/lib/permissions/agency-scope-server"),
  resolveAgencyPermissionScope: jest.fn(),
}))
jest.mock("@/lib/quotations/conversion", () => ({
  ...jest.requireActual("@/lib/quotations/conversion"),
  convertQuotationToOperation: jest.fn(),
}))
jest.mock("@/lib/quotations/conversion-effects", () => ({
  captureQuotationCommissionSnapshot: jest.fn(),
  ensureQuotationCommissionReviewAlert: jest.fn(),
  processQuotationConversionEffects: jest.fn(),
}))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))
jest.mock("@/lib/accounting/file-code", () => ({
  generateFileCode: jest.fn().mockReturnValue("OP-20260824-ABC12345"),
}))
jest.mock("@/lib/audit", () => ({
  getClientIP: jest.fn().mockReturnValue(null),
  logAudit: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("@/lib/provider-booking/booking", () => ({
  bookingFormSchema: jest.requireActual("@/lib/provider-booking/booking").bookingFormSchema,
  bookingItemsFromQuotation: jest.fn(),
  enqueueProviderBooking: jest.fn(),
}))

const fullScope = {
  module: "leads",
  permission: "write",
  userId: "user-1",
  memberAgencyIds: ["agency-1"],
  agencyIds: ["agency-1"],
  fullAgencyIds: ["agency-1"],
  ownAgencyIds: [],
  permissionsByAgency: {},
}

function quotationQueryWith(status: "DRAFT" | "SENT" | "PENDING_APPROVAL" | "APPROVED" | "CONVERTED" = "APPROVED") {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: "quotation-1",
        org_id: "org-1",
        agency_id: "agency-1",
        seller_id: "seller-1",
        status,
        operation_id: status === "CONVERTED" ? "operation-1" : null,
      },
      error: null,
    }),
  }
  return query
}

describe("POST /api/quotations/[id]/convert", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: {
        id: "user-1",
        email: "seller@example.com",
        org_id: "org-1",
        role: "SELLER",
        roles: ["SELLER"],
      },
    })
    ;(resolveAgencyPermissionScope as jest.Mock).mockImplementation(
      async (_supabase, _user, module: string, permission: string) => ({
        ...fullScope,
        module,
        permission,
      })
    )
    ;(checkLimit as jest.Mock).mockResolvedValue({ ok: true })
    ;(captureQuotationCommissionSnapshot as jest.Mock).mockResolvedValue({
      schema_version: 1,
      captured_at: "2026-08-24T12:00:00.000Z",
      profiles: [],
      base_config: { enabled: false, rate: 21, from: null },
    })
    ;(convertQuotationToOperation as jest.Mock).mockResolvedValue({
      operationId: "operation-1",
      fileCode: "OP-20260824-ABC12345",
      servicesCreated: 4,
      alreadyConverted: false,
    })
    ;(processQuotationConversionEffects as jest.Mock).mockResolvedValue({
      claimed: true,
      status: "COMPLETED",
      errors: [],
      warnings: [],
    })
    ;(ensureQuotationCommissionReviewAlert as jest.Mock).mockResolvedValue(true)
    ;(bookingItemsFromQuotation as jest.Mock).mockReturnValue([{ client_item_id: "item-1", product: "flights" }])
    ;(enqueueProviderBooking as jest.Mock).mockResolvedValue({ requestId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222", status: "queued" })
  })

  it("congela reglas y delega conversión y efectos a contratos durables", async () => {
    const query = quotationQueryWith("APPROVED")
    const server = { from: jest.fn(() => query) }
    const admin = { from: jest.fn(() => query), rpc: jest.fn() }
    ;(createServerClient as jest.Mock).mockResolvedValue(server)
    ;(createAdminClient as jest.Mock).mockReturnValue(admin)

    const response = await POST(
      { headers: { get: jest.fn().mockReturnValue(null) } } as any,
      { params: Promise.resolve({ id: "quotation-1" }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        operation_id: "operation-1",
        file_code: "OP-20260824-ABC12345",
        services_created: 4,
        already_converted: false,
        financial_effects_status: "COMPLETED",
      },
      warnings: [],
    })
    expect(checkLimit).toHaveBeenCalledWith(server, "org-1", "max_operations_per_month")
    expect(captureQuotationCommissionSnapshot).toHaveBeenCalledWith({
      supabase: admin,
      orgId: "org-1",
      agencyId: "agency-1",
      sellerIds: ["seller-1"],
    })
    expect(convertQuotationToOperation).toHaveBeenCalledWith(expect.objectContaining({
      supabase: admin,
      quotationId: "quotation-1",
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "user-1",
      commissionSnapshot: expect.objectContaining({ schema_version: 1 }),
    }))
    expect(processQuotationConversionEffects).toHaveBeenCalledWith({
      supabase: admin,
      operationId: "operation-1",
      orgId: "org-1",
    })
  })

  it("reporta REVIEW y sólo afirma la alerta cuando quedó persistida", async () => {
    const query = quotationQueryWith("APPROVED")
    const admin = { from: jest.fn(() => query), rpc: jest.fn() }
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(createAdminClient as jest.Mock).mockReturnValue(admin)
    ;(processQuotationConversionEffects as jest.Mock).mockResolvedValue({
      claimed: true,
      status: "REVIEW",
      errors: ["commission plan rejected"],
      warnings: [],
    })
    ;(ensureQuotationCommissionReviewAlert as jest.Mock).mockResolvedValue(false)

    const response = await POST(
      { headers: { get: jest.fn().mockReturnValue(null) } } as any,
      { params: Promise.resolve({ id: "quotation-1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.financial_effects_status).toBe("REVIEW")
    expect(body.warnings[0]).toContain("no se pudo generar la alerta")
    expect(ensureQuotationCommissionReviewAlert).toHaveBeenCalledWith({
      supabase: admin,
      orgId: "org-1",
      operationId: "operation-1",
      userId: "user-1",
      fileCode: "OP-20260824-ABC12345",
    })
  })

  it("en retry CONVERTED no consulta límites ni reconstruye reglas vigentes", async () => {
    const query = quotationQueryWith("CONVERTED")
    const admin = { from: jest.fn(() => query), rpc: jest.fn() }
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(createAdminClient as jest.Mock).mockReturnValue(admin)
    ;(convertQuotationToOperation as jest.Mock).mockResolvedValue({
      operationId: "operation-1",
      fileCode: "OP-EXISTING",
      servicesCreated: 4,
      alreadyConverted: true,
    })

    const response = await POST(
      { headers: { get: jest.fn().mockReturnValue(null) } } as any,
      { params: Promise.resolve({ id: "quotation-1" }) }
    )

    expect(response.status).toBe(200)
    expect(checkLimit).not.toHaveBeenCalled()
    expect(captureQuotationCommissionSnapshot).not.toHaveBeenCalled()
    expect(convertQuotationToOperation).toHaveBeenCalledWith(expect.objectContaining({
      commissionSnapshot: null,
    }))
    expect(processQuotationConversionEffects).toHaveBeenCalled()
  })

  it("mantiene 404 anti-oracle para datos propios de otro seller", async () => {
    const query = quotationQueryWith("APPROVED")
    ;(resolveAgencyPermissionScope as jest.Mock).mockImplementation(
      async (_supabase, _user, module: string, permission: string) => ({
        ...fullScope,
        module,
        permission,
        fullAgencyIds: [],
        ownAgencyIds: ["agency-1"],
      })
    )
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => query) })

    const response = await POST(
      { headers: { get: jest.fn().mockReturnValue(null) } } as any,
      { params: Promise.resolve({ id: "quotation-1" }) }
    )

    expect(response.status).toBe(404)
    expect(convertQuotationToOperation).not.toHaveBeenCalled()
  })

  it("convierte y deja la reserva durable en Wholesale antes de responder", async () => {
    const query = quotationQueryWith("APPROVED")
    const upsert = jest.fn().mockResolvedValue({ error: null })
    const admin = { from: jest.fn((table: string) => table === "quotation_provider_bookings" ? { upsert } : query), rpc: jest.fn() }
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(createAdminClient as jest.Mock).mockReturnValue(admin)
    const booking = {
      holder: { name: "Ada", surnames: ["Lovelace"], contact: { mails: ["ada@example.com"], phones: [{ country_pref: "+54", number: "1112345678" }] } },
      travellers: [{ type: "ADT", title: "Ms", name: "Ada", surnames: ["Lovelace"] }],
    }

    const response = await POST(
      { json: jest.fn().mockResolvedValue({ booking }), headers: { get: jest.fn().mockReturnValue(null) } } as any,
      { params: Promise.resolve({ id: "quotation-1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(enqueueProviderBooking).toHaveBeenCalledWith(expect.objectContaining({ quotationId: "quotation-1", operationId: "operation-1", form: booking }))
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ quotation_id: "quotation-1", remote_job_id: "22222222-2222-4222-8222-222222222222", status: "QUEUED" }), { onConflict: "quotation_id" })
    expect(body.data.provider_booking).toEqual(expect.objectContaining({ job_id: "22222222-2222-4222-8222-222222222222" }))
  })

  it("convierte un borrador cuando la agencia confirmó un refresco de precio", async () => {
    const query = quotationQueryWith("DRAFT")
    const upsert = jest.fn().mockResolvedValue({ error: null })
    const admin = { from: jest.fn((table: string) => table === "quotation_provider_bookings" ? { upsert } : query), rpc: jest.fn() }
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(createAdminClient as jest.Mock).mockReturnValue(admin)
    const booking = {
      holder: { name: "Ada", surnames: ["Lovelace"], contact: { mails: ["ada@example.com"], phones: [{ country_pref: "+54", number: "1112345678" }] } },
      travellers: [{ type: "ADT", title: "Ms", name: "Ada", surnames: ["Lovelace"] }],
    }
    const priceRefreshRunId = "33333333-3333-4333-8333-333333333333"
    const optionId = "44444444-4444-4444-8444-444444444444"

    const response = await POST(
      { json: jest.fn().mockResolvedValue({ booking, price_refresh_run_id: priceRefreshRunId, option_id: optionId }), headers: { get: jest.fn().mockReturnValue(null) } } as any,
      { params: Promise.resolve({ id: "quotation-1" }) }
    )

    expect(response.status).toBe(200)
    expect(bookingItemsFromQuotation).toHaveBeenCalledWith(expect.anything(), optionId)
    expect(convertQuotationToOperation).toHaveBeenCalledWith(expect.objectContaining({
      quotationId: "quotation-1",
      priceRefreshRunId,
      selectedOptionId: optionId,
      commissionSnapshot: expect.objectContaining({ schema_version: 1 }),
    }))
  })

  it("rechaza una reserva sin referencias Delfos antes de convertir la cotización", async () => {
    const query = quotationQueryWith("APPROVED")
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => query) })
    ;(bookingItemsFromQuotation as jest.Mock).mockReturnValue([])
    const booking = {
      holder: { name: "Ada", surnames: ["Lovelace"], contact: { mails: ["ada@example.com"], phones: [{ country_pref: "+54", number: "1112345678" }] } },
      travellers: [{ type: "ADT", title: "Ms", name: "Ada", surnames: ["Lovelace"] }],
    }

    const response = await POST(
      { json: jest.fn().mockResolvedValue({ booking }), headers: { get: jest.fn().mockReturnValue(null) } } as any,
      { params: Promise.resolve({ id: "quotation-1" }) }
    )

    expect(response.status).toBe(422)
    expect(convertQuotationToOperation).not.toHaveBeenCalled()
    expect(enqueueProviderBooking).not.toHaveBeenCalled()
  })
})
