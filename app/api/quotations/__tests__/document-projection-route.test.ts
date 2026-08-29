/** @jest-environment node */

import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))
jest.mock("@/lib/permissions/agency-scope-server", () => ({
  agencyPermissionMode: jest.fn(() => "full"),
  applyAgencyPermissionScope: jest.fn((query: unknown) => query),
  resolveAgencyPermissionScope: jest.fn(),
}))

const scope = {
  memberAgencyIds: ["agency-1"],
  agencyIds: ["agency-1"],
  ownAgencyIds: [],
  fullAgencyIds: ["agency-1"],
}

function resolvedQuery(result: { data: unknown; error: unknown }) {
  const query: any = {}
  for (const method of ["select", "eq", "in", "order", "range", "or", "is"]) {
    query[method] = jest.fn(() => query)
  }
  query.maybeSingle = jest.fn().mockResolvedValue(result)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return query
}

describe("quotation document projection in reads", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: {
        id: "seller-1",
        role: "SELLER",
        roles: ["SELLER"],
        org_id: "org-1",
      },
    })
    ;(createServerClient as jest.Mock).mockResolvedValue({})
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue(scope)

    const { Request, Response, Headers } = require("undici")
    global.Request = Request
    global.Response = Response
    global.Headers = Headers
  })

  it("adds NONE/READY to the list without replacing legacy fields", async () => {
    const listQuery = resolvedQuery({
      data: [
        {
          id: "quotation-1",
          status: "DRAFT",
          active_document_id: null,
          public_token: "public-token-1",
        },
        {
          id: "quotation-2",
          status: "SENT",
          active_document_id: "document-2",
          public_token: "public-token-2",
        },
      ],
      error: null,
    })
    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => listQuery),
    })

    const { GET } = require("../route")
    const response = await GET(new Request("http://localhost/api/quotations"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toEqual([
      expect.objectContaining({
        status: "DRAFT",
        active_document_id: null,
        public_token: "public-token-1",
        document: { status: "NONE", active_document_id: null },
      }),
      expect.objectContaining({
        status: "SENT",
        active_document_id: "document-2",
        public_token: "public-token-2",
        document: { status: "READY", active_document_id: "document-2" },
      }),
    ])
  })

  it("adds READY to quotation detail and preserves operators and legacy fields", async () => {
    const detailQuery = resolvedQuery({
      data: {
        id: "quotation-1",
        agency_id: "agency-1",
        status: "DRAFT",
        active_document_id: "document-1",
        public_token: "public-token-1",
      },
      error: null,
    })
    const operatorsQuery = resolvedQuery({
      data: [{ id: "operator-1", name: "Operador" }],
      error: null,
    })
    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => table === "quotations" ? detailQuery : operatorsQuery),
    })

    const { GET } = require("../[id]/route")
    const response = await GET(
      new Request("http://localhost/api/quotations/quotation-1"),
      { params: Promise.resolve({ id: "quotation-1" }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toEqual(expect.objectContaining({
      status: "DRAFT",
      active_document_id: "document-1",
      public_token: "public-token-1",
      available_operators: [{ id: "operator-1", name: "Operador" }],
      document: { status: "READY", active_document_id: "document-1" },
    }))
  })
})
