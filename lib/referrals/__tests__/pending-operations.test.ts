/**
 * Ventas sin comisión de referido (caso: el referidor se carga después de la
 * venta).
 *
 * Invariantes: solo entra el cliente MAIN, nunca una venta que ya tiene
 * comisión, el importe previsualizado usa la misma base que el cálculo real, y
 * un usuario acotado a una oficina no ve las ventas de otra.
 */

import { findOperationsMissingReferralCommission } from "../pending-operations"

type Rows = {
  customers?: any
  referral_partners?: any
  operation_customers?: any[]
  operations?: any[]
  referral_commissions?: any[]
  financial_settings?: any[]
}

/**
 * Mock del query-builder: las llamadas encadenadas devuelven el mismo objeto y
 * al await-earlo sale la lista de la tabla. Guarda los filtros aplicados para
 * poder afirmar sobre el scope.
 */
function makeSupabase(rows: Rows) {
  const filters: Array<{ table: string; method: string; args: any[] }> = []

  const builder = (table: keyof Rows) => {
    const chain: any = {
      select: () => chain,
      eq: (...args: any[]) => {
        filters.push({ table, method: "eq", args })
        return chain
      },
      neq: (...args: any[]) => {
        filters.push({ table, method: "neq", args })
        return chain
      },
      gt: (...args: any[]) => {
        filters.push({ table, method: "gt", args })
        return chain
      },
      in: (...args: any[]) => {
        filters.push({ table, method: "in", args })
        return chain
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows[table] ?? [], error: null }),
    }
    return chain
  }

  return { supabase: { from: (t: keyof Rows) => builder(t) } as any, filters }
}

const partner = { name: "Nico Trip", default_commission_percentage: 20, active: true }

const operation = (partial: Partial<any> = {}) => ({
  id: "op-1",
  file_code: "OP-1",
  operation_date: "2026-09-07",
  destination: "Cancún",
  agency_id: "ag-1",
  sale_amount_total: 4560,
  margin_amount: 339,
  sale_currency: "USD",
  currency: "USD",
  status: "CONFIRMED",
  ...partial,
})

const params = { customerId: "cli-1", orgId: "org-1" }

describe("findOperationsMissingReferralCommission", () => {
  it("lista la venta cargada antes de marcar al referidor, con el importe que le tocaría", async () => {
    const { supabase } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: partner,
      operation_customers: [{ operation_id: "op-1" }],
      operations: [operation()],
      referral_commissions: [],
    })

    const result = await findOperationsMissingReferralCommission({ supabase, ...params })

    expect(result.referral.partnerName).toBe("Nico Trip")
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0]).toMatchObject({
      operationId: "op-1",
      percentage: 20,
      // 20% sobre la ganancia bruta de 339.
      amount: 67.8,
      currency: "USD",
    })
  })

  it("descuenta el IVA de la base si la oficina tiene la base neta activa", async () => {
    const { supabase } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: partner,
      operation_customers: [{ operation_id: "op-1" }],
      operations: [operation()],
      referral_commissions: [],
      financial_settings: [
        {
          agency_id: "ag-1",
          commission_base_net_of_iva: true,
          commission_iva_rate: 0.105,
          commission_net_from: "2026-01-06",
        },
      ],
    })

    const result = await findOperationsMissingReferralCommission({ supabase, ...params })

    // 339 × (1 − 0,105) = 303,41 → 20% = 60,68
    expect(result.operations[0].baseAmount).toBe(303.41)
    expect(result.operations[0].amount).toBe(60.68)
  })

  it("deja afuera la venta que ya tiene comisión de referido", async () => {
    const { supabase } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: partner,
      operation_customers: [{ operation_id: "op-1" }],
      operations: [operation()],
      referral_commissions: [{ operation_id: "op-1" }],
    })

    const result = await findOperationsMissingReferralCommission({ supabase, ...params })
    expect(result.operations).toEqual([])
  })

  it("respeta el override de porcentaje del cliente sobre el default del referidor", async () => {
    const { supabase } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: 5 },
      referral_partners: partner,
      operation_customers: [{ operation_id: "op-1" }],
      operations: [operation()],
      referral_commissions: [],
    })

    const result = await findOperationsMissingReferralCommission({ supabase, ...params })
    expect(result.operations[0]).toMatchObject({ percentage: 5, amount: 16.95 })
  })

  it("no devuelve nada si el cliente no está referido", async () => {
    const { supabase } = makeSupabase({
      customers: { referral_partner_id: null, referral_commission_percentage: null },
      operations: [operation()],
    })

    const result = await findOperationsMissingReferralCommission({ supabase, ...params })
    expect(result.referral.partnerId).toBeNull()
    expect(result.operations).toEqual([])
  })

  it("solo mira las ventas donde el cliente es el pasajero principal", async () => {
    const { supabase, filters } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: partner,
      operation_customers: [{ operation_id: "op-1" }],
      operations: [operation()],
      referral_commissions: [],
    })

    await findOperationsMissingReferralCommission({ supabase, ...params })

    expect(
      filters.some(
        (f) => f.table === "operation_customers" && f.method === "eq" && f.args[0] === "role" && f.args[1] === "MAIN"
      )
    ).toBe(true)
  })

  it("acota las ventas a las oficinas visibles del usuario", async () => {
    const { supabase, filters } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: partner,
      operation_customers: [{ operation_id: "op-1" }],
      operations: [operation()],
      referral_commissions: [],
    })

    await findOperationsMissingReferralCommission({ supabase, ...params, agencyIds: ["ag-1"] })

    expect(
      filters.some(
        (f) => f.table === "operations" && f.method === "in" && f.args[0] === "agency_id"
      )
    ).toBe(true)
  })

  it("filtra por organización y descarta canceladas y sin ganancia", async () => {
    const { supabase, filters } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: partner,
      operation_customers: [{ operation_id: "op-1" }],
      operations: [operation()],
      referral_commissions: [],
    })

    await findOperationsMissingReferralCommission({ supabase, ...params })

    const opFilters = filters.filter((f) => f.table === "operations")
    expect(opFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "eq", args: ["org_id", "org-1"] }),
        expect.objectContaining({ method: "neq", args: ["status", "CANCELLED"] }),
        expect.objectContaining({ method: "gt", args: ["margin_amount", 0] }),
      ])
    )
  })

  it("avisa cuando el cliente tiene más ventas que el tope revisado", async () => {
    const many = Array.from({ length: 3 }, (_, i) =>
      operation({ id: `op-${i}`, file_code: `OP-${i}` })
    )
    const { supabase } = makeSupabase({
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: partner,
      operation_customers: many.map((op) => ({ operation_id: op.id })),
      operations: many,
      referral_commissions: [],
    })

    const result = await findOperationsMissingReferralCommission({
      supabase,
      ...params,
      limit: 2,
    })

    expect(result.truncated).toBe(true)
    expect(result.operations).toHaveLength(2)
  })
})
