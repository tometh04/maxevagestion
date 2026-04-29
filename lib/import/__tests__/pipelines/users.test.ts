import { usersPipeline } from "../../pipelines/users"

// Mock the admin client from supabase/server
jest.mock("@/lib/supabase/server")
import { createAdminClient } from "@/lib/supabase/server"

const AGENCY_ID = "agency-uuid-1"
const ORG_ID = "org-uuid-1"
const AUTH_ID = "auth-uuid-1"
const USER_ID = "user-uuid-1"

const CSV_SAMPLE = `Nombre,Email,Rol,Comision,Password
Julian,julian@madero.com,SELLER,20,madero123
Rama,rama@madero.com,SELLER,25,madero123
,noname@madero.com,SELLER,10,madero123`
// Row 4: missing name → error

const CSV_INVALID_PASSWORD = `Nombre,Email,Rol,Comision,Password
Short,short@test.com,SELLER,10,abc`
// Password < 6 chars → error

function makeAdminMock(opts: {
  existingAuthUser?: any
  existingPublicUser?: any
  insertUserResult?: any
  upsertLinkError?: any
} = {}) {
  const { createUserMock, getUserByEmailMock, fromMock, upsertMock, insertMock, updateMock } = buildMocks(opts)

  const mock = {
    auth: {
      admin: {
        createUser: createUserMock,
        getUserByEmail: getUserByEmailMock,
      },
    },
    from: fromMock,
    // exposed for assertions
    _createUser: createUserMock,
    _getUserByEmail: getUserByEmailMock,
    _insert: insertMock,
    _upsert: upsertMock,
    _update: updateMock,
  }

  ;(createAdminClient as jest.Mock).mockReturnValue(mock)
  return mock
}

function buildMocks(opts: {
  existingAuthUser?: any
  existingPublicUser?: any
  insertUserResult?: any
  upsertLinkError?: any
}) {
  const createUserMock = jest.fn().mockResolvedValue({
    data: { user: { id: AUTH_ID } },
    error: null,
  })

  const getUserByEmailMock = jest.fn().mockResolvedValue(
    opts.existingAuthUser
      ? { data: { user: opts.existingAuthUser }, error: null }
      : { data: null, error: { message: "User not found" } }
  )

  const updateMock = jest.fn().mockReturnThis()
  const updateEqMock = jest.fn().mockResolvedValue({ data: null, error: null })

  const insertMock = jest.fn().mockReturnThis()
  const upsertMock = jest.fn().mockResolvedValue({
    data: null,
    error: opts.upsertLinkError ?? null,
  })

  // Build a chainable query mock for .from()
  // agencies query → maybeSingle → org_id
  // users query (existing check) → maybeSingle
  // users insert → select → single
  // user_agencies upsert → resolved

  let callCount = 0

  const maybeSingleMock = jest.fn().mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // agencies lookup
      return Promise.resolve({ data: { org_id: ORG_ID }, error: null })
    }
    // users existing lookup
    return Promise.resolve({
      data: opts.existingPublicUser ?? null,
      error: null,
    })
  })

  const singleMock = jest.fn().mockResolvedValue({
    data: opts.insertUserResult ?? { id: USER_ID },
    error: null,
  })

  const selectMock = jest.fn().mockReturnThis()
  const eqMock = jest.fn().mockReturnThis()

  const fromMock = jest.fn().mockReturnValue({
    select: selectMock,
    eq: eqMock,
    insert: insertMock,
    upsert: upsertMock,
    update: updateMock,
    maybeSingle: maybeSingleMock,
    single: singleMock,
  })

  // Wire chainable methods to return the same object
  selectMock.mockReturnThis()
  eqMock.mockReturnThis()
  insertMock.mockReturnThis()
  updateMock.mockReturnThis()
  updateEqMock.mockResolvedValue({ data: null, error: null })

  return { createUserMock, getUserByEmailMock, fromMock, upsertMock, insertMock, updateMock }
}

const BASE_CONFIG = {
  agencyId: AGENCY_ID,
  exchangeRate: { mode: "manual_fixed" as const, manualRate: 1450 },
}

describe("usersPipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("dry-run: cuenta filas válidas e inválidas sin llamar a createUser", async () => {
    makeAdminMock()

    const result = await usersPipeline(
      {} as any,
      CSV_SAMPLE,
      BASE_CONFIG,
      { dryRun: true }
    )

    expect(result.totalRows).toBe(3)
    expect(result.successRows).toBe(2) // rows 1 and 2 valid
    expect(result.errorRows).toBe(1)   // row 3: missing name
    expect(result.errors[0].rowNumber).toBe(4)
    expect(result.errors[0].field).toBe("name")

    // No auth calls in dry-run
    const adminMock = (createAdminClient as jest.Mock).mock.results[0].value
    expect(adminMock.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it("dry-run: password corta produce error de validación", async () => {
    makeAdminMock()

    const result = await usersPipeline(
      {} as any,
      CSV_INVALID_PASSWORD,
      BASE_CONFIG,
      { dryRun: true }
    )

    expect(result.totalRows).toBe(1)
    expect(result.successRows).toBe(0)
    expect(result.errorRows).toBe(1)
    expect(result.errors[0].field).toBe("password")
  })

  it("dry-run: rol inválido produce warning y usa SELLER por defecto", async () => {
    makeAdminMock()
    const csv = `Nombre,Email,Rol,Comision,Password\nCarlos,carlos@test.com,MANAGER,15,password123`

    const result = await usersPipeline(
      {} as any,
      csv,
      BASE_CONFIG,
      { dryRun: true }
    )

    expect(result.successRows).toBe(1)
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0].message).toContain("SELLER")
  })

  it("ejecución real: llama createUser para cada fila nueva y vincula a la agencia", async () => {
    const adminMock = makeAdminMock()

    const result = await usersPipeline(
      {} as any,
      CSV_SAMPLE,
      BASE_CONFIG
    )

    // 2 valid rows, 1 error row
    expect(result.successRows).toBe(2)
    expect(result.errorRows).toBe(1)

    // createUser called twice (getUserByEmail returned error → user doesn't exist)
    expect(adminMock._createUser).toHaveBeenCalledTimes(2)
    expect(adminMock._createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "julian@madero.com",
        password: "madero123",
        email_confirm: true,
        user_metadata: { full_name: "Julian" },
      })
    )

    // user_agencies upsert called twice
    expect(adminMock._upsert).toHaveBeenCalledTimes(2)
    expect(adminMock._upsert).toHaveBeenCalledWith(
      expect.objectContaining({ agency_id: AGENCY_ID }),
      expect.objectContaining({ ignoreDuplicates: true })
    )
  })

  it("ejecución real: si auth user ya existe, no llama createUser", async () => {
    const adminMock = makeAdminMock({
      existingAuthUser: { id: AUTH_ID },
    })

    const csv = `Nombre,Email,Rol,Comision,Password\nJulian,julian@madero.com,SELLER,20,madero123`

    const result = await usersPipeline(
      {} as any,
      csv,
      BASE_CONFIG
    )

    expect(result.successRows).toBe(1)
    expect(adminMock._createUser).not.toHaveBeenCalled()
    expect(adminMock._getUserByEmail).toHaveBeenCalledWith("julian@madero.com")
  })

  it("previewSummary incluye usersToCreate", async () => {
    makeAdminMock()

    const result = await usersPipeline(
      {} as any,
      CSV_SAMPLE,
      BASE_CONFIG
    )

    expect(result.previewSummary.usersToCreate).toBe(2)
  })
})
