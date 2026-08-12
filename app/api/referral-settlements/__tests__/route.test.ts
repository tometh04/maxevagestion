/**
 * @jest-environment node
 *
 * VIB-86 — Liquidar comisiones al referidor saca plata de una cuenta.
 *
 * Lo que se protege acá:
 *   1. Quién puede liquidar. El gate es `referrals:read` + `cash:write`, así que
 *      un SELLER no puede y un CONTABLE sí (antes el gate era
 *      `commissions:write`, que CONTABLE no tiene, y no podía liquidar aunque el
 *      diseño del módulo dijera que es su tarea).
 *   2. Que el movimiento de ledger vaya SIN operation_id y SIN seller_id.
 *      createLedgerMovement() con type=COMMISSION + operation_id dispara
 *      markCommissionsAsPaidIfLedgerExists(), que marcaría como pagada la
 *      comisión del VENDEDOR de esa operación: pagarle al referidor le pagaría
 *      solo la comisión a otro.
 *   3. Que no se pueda liquidar mezclando monedas.
 *
 * Se deja correr el `canPerformAction` real contra la matriz estática; sólo se
 * mockean el borde HTTP (permisos del request), Supabase y el ledger.
 */

import { POST } from "@/app/api/referral-settlements/route"
import { getRequestPermissions } from "@/lib/permissions/request"
import { createLedgerMovement, validateSufficientBalance } from "@/lib/accounting/ledger"

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/accounting/ledger", () => ({
  createLedgerMovement: jest.fn(async () => ({ id: "ledger-1" })),
  validateSufficientBalance: jest.fn(async () => ({ valid: true, currentBalance: 999999 })),
}))
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRateWithFallback: jest.fn(async () => ({ rate: 1300, source: "latest" })),
}))

const ORG = "org-1"
const PARTNER = { id: "partner-1", name: "Nico Trip", agency_id: null }
const ACCOUNT_USD = { id: "acc-usd", name: "Caja USD", currency: "USD", is_active: true }

function comision(over: Record<string, any> = {}) {
  return {
    id: "com-1",
    referral_partner_id: PARTNER.id,
    agency_id: null,
    currency: "USD",
    amount: 100,
    status: "PENDING",
    settlement_id: null,
    date_calculated: "2026-08-04T00:00:00.000Z",
    ...over,
  }
}

/**
 * Mock del query-builder. Devuelve filas por tabla y captura los writes.
 * `claimed` simula lo que el UPDATE con CAS logra imputar.
 */
function makeSupabase(opts: {
  commissions: any[]
  claimed?: any[]
}) {
  const inserts: Record<string, any> = {}
  const updates: Array<{ table: string; payload: any }> = []
  const claimed = opts.claimed ?? opts.commissions
  const deletes: string[] = []

  const client: any = {
    from: jest.fn((table: string) => {
      let op: "select" | "insert" | "update" | "delete" = "select"
      const builder: any = {
        select: jest.fn(() => builder),
        insert: jest.fn((payload: any) => {
          op = "insert"
          inserts[table] = payload
          return builder
        }),
        update: jest.fn((payload: any) => {
          op = "update"
          updates.push({ table, payload })
          return builder
        }),
        delete: jest.fn(() => {
          op = "delete"
          deletes.push(table)
          return builder
        }),
        eq: jest.fn(() => builder),
        in: jest.fn(() => builder),
        is: jest.fn(() => builder),
        order: jest.fn(() => builder),
        single: jest.fn(async () => ({ data: singleFor(table, op), error: null })),
        maybeSingle: jest.fn(async () => ({ data: singleFor(table, op), error: null })),
        then: (resolve: any) =>
          Promise.resolve({ data: listFor(table, op), error: null }).then(resolve),
      }
      return builder
    }),
    rpc: jest.fn(async () => ({ data: null, error: null })),
  }

  function singleFor(table: string, op: string) {
    if (table === "referral_partners") return PARTNER
    if (table === "financial_accounts") return ACCOUNT_USD
    if (table === "referral_settlements") {
      return { id: "settlement-1", ...(inserts["referral_settlements"] ?? {}) }
    }
    if (op === "insert") return { id: `${table}-new` }
    return null
  }

  function listFor(table: string, op: string) {
    if (table === "referral_commissions") {
      return op === "update" ? claimed : opts.commissions
    }
    return []
  }

  return { client, inserts, updates, deletes }
}

function mockRequest(body: any): Request {
  return { json: async () => body } as unknown as Request
}

function setUser(role: string, supabase: any) {
  ;(getRequestPermissions as jest.Mock).mockResolvedValue({
    user: { id: "user-1", org_id: ORG, role, roles: [role] },
    supabase,
    agencyIds: [],
    // null → canPerformAction cae a la matriz estática, que es la que queremos verificar.
    matrix: null,
  })
}

const BODY_OK = {
  commissionIds: ["com-1"],
  financial_account_id: ACCOUNT_USD.id,
  exchange_rate: 1300,
  paid_at: "2026-08-12",
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createLedgerMovement as jest.Mock).mockResolvedValue({ id: "ledger-1" })
  ;(validateSufficientBalance as jest.Mock).mockResolvedValue({ valid: true, currentBalance: 999999 })
})

describe("POST /api/referral-settlements — permisos", () => {
  it("un SELLER no puede liquidar (no mueve caja)", async () => {
    const { client } = makeSupabase({ commissions: [comision()] })
    setUser("SELLER", client)

    const res = await POST(mockRequest(BODY_OK))

    expect(res.status).toBe(403)
    expect(createLedgerMovement).not.toHaveBeenCalled()
  })

  it("un CONTABLE sí puede liquidar", async () => {
    const { client } = makeSupabase({ commissions: [comision()] })
    setUser("CONTABLE", client)

    const res = await POST(mockRequest(BODY_OK))

    expect(res.status).toBe(200)
    expect(createLedgerMovement).toHaveBeenCalledTimes(1)
  })

  it("un ADMIN puede liquidar", async () => {
    const { client } = makeSupabase({ commissions: [comision()] })
    setUser("ADMIN", client)

    const res = await POST(mockRequest(BODY_OK))
    expect(res.status).toBe(200)
  })
})

describe("POST /api/referral-settlements — salida de caja", () => {
  it("crea el movimiento sin operation_id ni seller_id", async () => {
    const { client } = makeSupabase({ commissions: [comision()] })
    setUser("ADMIN", client)

    await POST(mockRequest(BODY_OK))

    const [params] = (createLedgerMovement as jest.Mock).mock.calls[0]
    expect(params.type).toBe("COMMISSION")
    // El hook que marca comisiones de vendedor como pagadas necesita ambos:
    // sin operation_id ni siquiera se dispara.
    expect(params.operation_id).toBeNull()
    expect(params.seller_id).toBeNull()
    expect(params.org_id).toBe(ORG)
    expect(params.account_id).toBe(ACCOUNT_USD.id)
  })

  it("valida saldo suficiente antes de pagar", async () => {
    const { client } = makeSupabase({ commissions: [comision()] })
    setUser("ADMIN", client)
    ;(validateSufficientBalance as jest.Mock).mockResolvedValue({
      valid: false,
      currentBalance: 0,
      error: "Saldo insuficiente",
    })

    const res = await POST(mockRequest(BODY_OK))

    expect(res.status).toBe(400)
    expect(createLedgerMovement).not.toHaveBeenCalled()
  })

  it("registra el egreso en la moneda de la cuenta al pagar cross-moneda", async () => {
    const { client } = makeSupabase({ commissions: [comision({ currency: "USD", amount: 100 })] })
    setUser("ADMIN", client)
    // Cuenta en ARS: salen 130.000, no 100.
    const arsAccount = { id: "acc-ars", name: "Caja ARS", currency: "ARS", is_active: true }
    client.from = jest.fn((table: string) => {
      const base = makeSupabase({ commissions: [comision()] }).client.from(table)
      if (table === "financial_accounts") {
        base.maybeSingle = jest.fn(async () => ({ data: arsAccount, error: null }))
      }
      return base
    })

    await POST(mockRequest({ ...BODY_OK, financial_account_id: arsAccount.id }))

    const [params] = (createLedgerMovement as jest.Mock).mock.calls[0]
    expect(params.currency).toBe("ARS")
    expect(params.amount_original).toBe(130000)
    expect(params.amount_ars_equivalent).toBe(130000)
  })
})

describe("POST /api/referral-settlements — validaciones", () => {
  it("rechaza mezclar monedas en una misma liquidación", async () => {
    const { client } = makeSupabase({
      commissions: [comision({ id: "com-1", currency: "USD" }), comision({ id: "com-2", currency: "ARS" })],
    })
    setUser("ADMIN", client)

    const res = await POST(mockRequest({ ...BODY_OK, commissionIds: ["com-1", "com-2"] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/distintas monedas/i)
    expect(createLedgerMovement).not.toHaveBeenCalled()
  })

  it("rechaza comisiones de otra organización", async () => {
    // La query viene scopeada por org: si falta alguna, no es del tenant.
    const { client } = makeSupabase({ commissions: [] })
    setUser("ADMIN", client)

    const res = await POST(mockRequest(BODY_OK))

    expect(res.status).toBe(404)
    expect(createLedgerMovement).not.toHaveBeenCalled()
  })

  it("aborta y compensa si otra sesión liquidó una comisión en el medio", async () => {
    const { client, deletes } = makeSupabase({
      commissions: [comision({ id: "com-1" }), comision({ id: "com-2" })],
      // El CAS sólo pudo imputar una de las dos.
      claimed: [{ id: "com-1", amount: 100 }],
    })
    setUser("ADMIN", client)

    const res = await POST(mockRequest({ ...BODY_OK, commissionIds: ["com-1", "com-2"] }))

    expect(res.status).toBe(409)
    expect(createLedgerMovement).not.toHaveBeenCalled()
    // La liquidación a medio crear se borra: nada queda pagado sin egreso.
    expect(deletes).toContain("referral_settlements")
  })

  it("exige al menos una comisión y una cuenta", async () => {
    const { client } = makeSupabase({ commissions: [comision()] })
    setUser("ADMIN", client)

    expect((await POST(mockRequest({ ...BODY_OK, commissionIds: [] }))).status).toBe(400)
    expect((await POST(mockRequest({ ...BODY_OK, financial_account_id: "" }))).status).toBe(400)
  })
})
