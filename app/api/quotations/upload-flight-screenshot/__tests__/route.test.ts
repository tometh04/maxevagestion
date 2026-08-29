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
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { POST } from "../route"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({
  ...jest.requireActual("@/lib/permissions/agency-scope-server"),
  resolveAgencyPermissionScope: jest.fn(),
}))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))

const ORG_ID = "11111111-1111-4111-8111-111111111111"
const AGENCY_ID = "22222222-2222-4222-8222-222222222222"
const OTHER_AGENCY_ID = "33333333-3333-4333-8333-333333333333"
const USER_ID = "44444444-4444-4444-8444-444444444444"
const QUOTATION_ID = "55555555-5555-4555-8555-555555555555"
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

function requestWith(input: {
  agencyId?: string
  quotationId?: string
  fileType?: string
  fileName?: string
  fileBytes?: number[]
}) {
  const bytes = new Uint8Array(input.fileBytes ?? PNG_BYTES)
  const values = new Map<string, unknown>()
  values.set("file", {
    name: input.fileName || "captura.png",
    type: input.fileType || "image/png",
    size: bytes.length,
    slice: (start: number, end: number) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
    arrayBuffer: async () => bytes.buffer,
  })
  if (input.agencyId) values.set("agencyId", input.agencyId)
  if (input.quotationId) values.set("quotationId", input.quotationId)
  return {
    formData: async () => ({ get: (key: string) => values.get(key) ?? null }),
  } as unknown as Request
}

function quotationQuery(result: unknown) {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue({ data: result, error: null }),
  }
  return query
}

function storageAdmin(query?: unknown) {
  const upload = jest.fn().mockResolvedValue({ error: null })
  const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: "https://storage.example/captura.png" } })
  const bucket = { upload, getPublicUrl }
  const admin = {
    from: jest.fn().mockReturnValue(query),
    storage: { from: jest.fn().mockReturnValue(bucket) },
  }
  ;(createAdminClient as jest.Mock).mockReturnValue(admin)
  return { admin, upload }
}

describe("POST /api/quotations/upload-flight-screenshot", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, org_id: ORG_ID, role: "SELLER", roles: ["SELLER"] },
    })
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn() })
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({
      module: "leads",
      permission: "write",
      userId: USER_ID,
      memberAgencyIds: [AGENCY_ID],
      agencyIds: [AGENCY_ID],
      fullAgencyIds: [],
      ownAgencyIds: [AGENCY_ID],
      permissionsByAgency: {},
    })
  })

  it("rechaza antes del service role cuando falta leads.write", async () => {
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({
      memberAgencyIds: [AGENCY_ID],
      agencyIds: [],
      fullAgencyIds: [],
      ownAgencyIds: [],
    })

    const response = await POST(requestWith({ agencyId: AGENCY_ID }))

    expect(response.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("rechaza contenido HTML aunque declare image/png", async () => {
    const response = await POST(requestWith({
      agencyId: AGENCY_ID,
      fileType: "image/png",
      fileBytes: Array.from(Buffer.from("<html>payload</html>")),
    }))

    expect(response.status).toBe(400)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("acepta bytes PNG válidos aunque el navegador declare MIME genérico", async () => {
    const { upload } = storageAdmin()

    const response = await POST(requestWith({
      agencyId: AGENCY_ID,
      fileType: "application/octet-stream",
      fileName: "captura",
    }))

    expect(response.status).toBe(200)
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/\.png$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png" })
    )
  })

  it("rechaza bytes GIF aunque el navegador declare PNG", async () => {
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64")

    const response = await POST(requestWith({
      agencyId: AGENCY_ID,
      fileType: "image/png",
      fileBytes: Array.from(gif),
    }))

    expect(response.status).toBe(400)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("no permite subir un borrador en una agencia fuera del scope", async () => {
    const response = await POST(requestWith({ agencyId: OTHER_AGENCY_ID }))

    expect(response.status).toBe(404)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("valida org, agencia y own-data antes de subir para una cotización", async () => {
    const query = quotationQuery({ id: QUOTATION_ID, agency_id: AGENCY_ID, seller_id: USER_ID })
    const { upload } = storageAdmin(query)

    const response = await POST(requestWith({
      agencyId: AGENCY_ID,
      quotationId: QUOTATION_ID,
      fileName: "captura.html",
      fileType: "image/png",
    }))

    expect(response.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith("org_id", ORG_ID)
    expect(query.in).toHaveBeenCalledWith("agency_id", [AGENCY_ID])
    expect(query.eq).toHaveBeenCalledWith("seller_id", USER_ID)
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(
        `^quotations/flight-screenshots/${ORG_ID}/${AGENCY_ID}/${USER_ID}/${QUOTATION_ID}/.+\\.png$`
      )),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png", upsert: false })
    )
  })

  it("rechaza una agencia declarada distinta de la cotización validada", async () => {
    const query = quotationQuery({ id: QUOTATION_ID, agency_id: AGENCY_ID, seller_id: USER_ID })
    const { upload } = storageAdmin(query)

    const response = await POST(requestWith({
      agencyId: OTHER_AGENCY_ID,
      quotationId: QUOTATION_ID,
    }))

    expect(response.status).toBe(404)
    expect(upload).not.toHaveBeenCalled()
  })
})
