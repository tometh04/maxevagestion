/**
 * @jest-environment node
 *
 * Dividir un gasto entre oficinas.
 *
 * El reparto en sí lo hace la función `split_agency_expense` en una sola
 * transacción, y sus reglas están probadas contra el esquema real. Lo que se
 * fija acá es lo que la ruta agrega encima: que sólo pueda dividir quien puede
 * tocar gastos, que no se le puedan imputar partes a una oficina que el usuario
 * no ve, y que el motivo del rechazo llegue al usuario en vez de convertirse en
 * un 500 genérico.
 */

import { POST } from "@/app/api/expenses/variable/[id]/split/route"
import { getRequestPermissions } from "@/lib/permissions/request"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({
  ...jest.requireActual("@/lib/permissions-api"),
  getScopedAgenciesForUser: jest.fn(),
}))
jest.mock("@/lib/accounting/ledger", () => ({ invalidateBalanceCache: jest.fn() }))
jest.mock("@/lib/accounting/audit", () => ({ logAccountingAction: jest.fn() }))
jest.mock("@/lib/accounting/movement-journal", () => ({
  createMovementJournalEntry: jest.fn(async () => "entry-1"),
  COUNTERPART_CODES: { EXPENSE: "4.3.01" },
}))

const MOV_ID = "e12e1955-49e7-453d-9861-cf1536151785"
const ROSARIO = "66563aeb-4e8b-40ee-a622-b39defb380dd"
const MADERO = "fabbc2e7-81d8-4ca1-85b2-7809c5f88e75"
const AJENA = "11111111-2222-3333-4444-555555555555"

/** Argumentos con los que se llamó a la función de base de datos. */
let rpcArgs: any = null

function setup({
  role = "ADMIN",
  rpcError = null as { code: string; message: string } | null,
  agencias = [
    { id: ROSARIO, name: "Rosario" },
    { id: MADERO, name: "Madero" },
  ],
}: { role?: string; rpcError?: { code: string; message: string } | null; agencias?: any[] } = {}) {
  rpcArgs = null

  const supabase: any = {
    rpc: async (_fn: string, args: any) => {
      rpcArgs = args
      if (rpcError) return { data: null, error: rpcError }
      return {
        data: {
          movement_id: MOV_ID,
          created: [{ cash_movement_id: "cm-2", ledger_movement_id: "lm-2", agency_id: MADERO }],
        },
        error: null,
      }
    },
    from: () => ({
      select: () => ({
        eq: function () {
          return this
        },
        maybeSingle: async () => ({ data: { financial_account_id: "acc-1" }, error: null }),
      }),
    }),
  }

  ;(getRequestPermissions as jest.Mock).mockResolvedValue({
    user: { id: "u-1", role, org_id: "org-1" },
    supabase,
    matrix: null,
  })
  ;(getScopedAgenciesForUser as jest.Mock).mockResolvedValue(agencias)
}

async function dividir(shares: any) {
  const req = { json: async () => ({ shares }) } as any
  const res: any = await POST(req, { params: Promise.resolve({ id: MOV_ID }) })
  return { status: res.status, body: await res.json() }
}

const MITADES = [
  { agency_id: ROSARIO, amount: 1168.23 },
  { agency_id: MADERO, amount: 1168.23 },
]

beforeEach(() => jest.clearAllMocks())

describe("POST /api/expenses/variable/[id]/split", () => {
  it("divide y le pasa el reparto entero a la base", async () => {
    setup()
    const { status } = await dividir(MITADES)

    expect(status).toBe(200)
    expect(rpcArgs.p_movement_id).toBe(MOV_ID)
    expect(rpcArgs.p_org_id).toBe("org-1")
    expect(rpcArgs.p_shares).toEqual(MITADES)
  })

  it("le pone a cada parte la oficina que le toca en el asiento", async () => {
    // Las partes salen de la misma cuenta financiera: sin pasar la oficina, el
    // asiento la derivaría de la cuenta y las dos caerían en la misma.
    setup()
    await dividir(MITADES)

    const { createMovementJournalEntry } = require("@/lib/accounting/movement-journal")
    expect(createMovementJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ movementId: "lm-2", agencyId: MADERO, direction: "OUT" }),
      expect.anything()
    )
  })

  it("rechaza al que no puede tocar gastos", async () => {
    setup({ role: "VIEWER" })
    const { status } = await dividir(MITADES)

    expect(status).toBe(403)
    expect(rpcArgs).toBeNull()
  })

  it("no deja imputarle una parte a una oficina que el usuario no ve", async () => {
    setup({ agencias: [{ id: ROSARIO, name: "Rosario" }] })
    const { status, body } = await dividir([
      { agency_id: ROSARIO, amount: 1168.23 },
      { agency_id: AJENA, amount: 1168.23 },
    ])

    expect(status).toBe(400)
    expect(body.error).toContain("no es válida")
    expect(rpcArgs).toBeNull()
  })

  it("exige al menos dos partes: una sola no es dividir", async () => {
    setup()
    const { status } = await dividir([{ agency_id: ROSARIO, amount: 2336.46 }])

    expect(status).toBe(400)
    expect(rpcArgs).toBeNull()
  })

  it("rechaza un importe que no es un número", async () => {
    setup()
    const { status } = await dividir([
      { agency_id: ROSARIO, amount: "1168.23" },
      { agency_id: MADERO, amount: 1168.23 },
    ])

    expect(status).toBe(400)
    expect(rpcArgs).toBeNull()
  })

  it("le muestra al usuario por qué la base rechazó el reparto", async () => {
    // Sin esto, "las partes no suman el total" llegaría como 500 y el usuario
    // no sabría qué corregir.
    setup({
      rpcError: {
        code: "P0001",
        message: "Las partes tienen que sumar exactamente el total del gasto",
      },
    })
    const { status, body } = await dividir(MITADES)

    expect(status).toBe(400)
    expect(body.error).toContain("sumar exactamente")
  })

  it("un gasto de otra org es un 404, no un 500", async () => {
    setup({ rpcError: { code: "P0002", message: "Gasto no encontrado" } })
    const { status } = await dividir(MITADES)

    expect(status).toBe(404)
  })

  it("un error inesperado de la base no filtra el detalle interno", async () => {
    setup({ rpcError: { code: "42883", message: "function does not exist" } })
    const { status, body } = await dividir(MITADES)

    expect(status).toBe(500)
    expect(body.error).not.toContain("function does not exist")
  })
})
