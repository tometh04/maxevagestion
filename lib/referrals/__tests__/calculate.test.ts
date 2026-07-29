/**
 * Tests del cálculo de comisión al referidor (VIB-62).
 *
 * Invariante: la comisión al referidor se calcula sobre el MARGEN, es idempotente
 * por operation_id, respeta el override del cliente sobre el default del partner,
 * y NUNCA pisa una comisión ya PAID/CANCELLED en un recálculo automático.
 */

import { createOrUpdateReferralCommission } from "../calculate"

type Rows = {
  referral_commissions?: any
  customers?: any
  referral_partners?: any
}

/**
 * Mock mínimo del query-builder de Supabase. `maybeSingle()` devuelve la fila
 * preconfigurada por tabla; captura los insert/update/delete para las aserciones.
 */
function makeSupabase(rows: Rows) {
  const calls = {
    inserted: [] as any[],
    updated: [] as any[],
    deleted: 0,
  }

  const builder = (table: keyof Rows) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      insert: (payload: any) => {
        calls.inserted.push({ table, payload })
        return { select: () => chain, single: async () => ({ data: { id: "new-id" }, error: null }), error: null, then: undefined }
      },
      update: (payload: any) => {
        calls.updated.push({ table, payload })
        return { eq: async () => ({ data: null, error: null }) }
      },
      delete: () => ({
        eq: async () => {
          calls.deleted++
          return { data: null, error: null }
        },
      }),
    }
    // insert() se usa como `await supabase.from().insert(...)` → debe ser thenable.
    return chain
  }

  const supabase: any = { from: (t: keyof Rows) => builder(t) }
  return { supabase, calls }
}

const base = {
  operationId: "op-1",
  orgId: "org-1",
  agencyId: "ag-1",
  currency: "ARS",
}

describe("createOrUpdateReferralCommission", () => {
  it("no hace nada si el cliente no está referido", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: null,
      customers: { referral_partner_id: null, referral_commission_percentage: null },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(res.status).toBe("skipped")
    expect(res.reason).toBe("not_referred")
    expect(calls.inserted).toHaveLength(0)
  })

  it("no genera comisión con margen <= 0 aunque haya referidor", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: null,
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: { default_commission_percentage: 10, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 0,
      ...base,
    })

    expect(res.status).toBe("skipped")
    expect(res.reason).toBe("non_positive_margin")
    expect(calls.inserted).toHaveLength(0)
  })

  it("calcula sobre el margen usando el % por defecto del partner", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: null,
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: { default_commission_percentage: 10, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(res.status).toBe("created")
    expect(res.percentage).toBe(10)
    expect(res.amount).toBe(1000) // 10000 * 10%
    expect(calls.inserted).toHaveLength(1)
    expect(calls.inserted[0].payload).toMatchObject({
      operation_id: "op-1",
      referral_partner_id: "p-1",
      basis: "MARGIN",
      base_amount: 10000,
      percentage: 10,
      amount: 1000,
      status: "PENDING",
    })
  })

  it("el override del cliente gana sobre el default del partner", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: null,
      customers: { referral_partner_id: "p-1", referral_commission_percentage: 5 },
      referral_partners: { default_commission_percentage: 10, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 20000,
      ...base,
    })

    expect(res.percentage).toBe(5)
    expect(res.amount).toBe(1000) // 20000 * 5%
    expect(calls.inserted).toHaveLength(1)
  })

  it("actualiza (no duplica) si ya existe una comisión PENDING", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: { id: "rc-1", status: "PENDING" },
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: { default_commission_percentage: 10, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(res.status).toBe("updated")
    expect(calls.inserted).toHaveLength(0)
    expect(calls.updated).toHaveLength(1)
    expect(calls.updated[0].payload.amount).toBe(1000)
  })

  it("NO pisa una comisión ya PAID en un recálculo automático", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: { id: "rc-1", status: "PAID" },
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: { default_commission_percentage: 10, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(res.status).toBe("skipped")
    expect(res.reason).toBe("existing_non_pending")
    expect(calls.inserted).toHaveLength(0)
    expect(calls.updated).toHaveLength(0)
  })

  it("elimina la comisión PENDING previa si el cliente deja de estar referido", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: { id: "rc-1", status: "PENDING" },
      customers: { referral_partner_id: null, referral_commission_percentage: null },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(res.status).toBe("removed")
    expect(calls.deleted).toBe(1)
  })
})

describe("ajuste manual del % en una venta puntual (VIB-86)", () => {
  it("el ajuste manual sobrevive al recálculo y no lo pisa el % del cliente", async () => {
    // Lo que pidió el cliente: el referidor se marca una vez y todas sus ventas
    // generan comisión sola, pero un admin puede pactar otro % en una venta.
    // Sin esto, editar la operación —una fecha, un servicio— lo revertía.
    const { supabase, calls } = makeSupabase({
      referral_commissions: {
        id: "rc-1",
        status: "PENDING",
        percentage: 7,
        percentage_mode: "MANUAL",
      },
      customers: { referral_partner_id: "p-1", referral_commission_percentage: 20 },
      referral_partners: { default_commission_percentage: 35, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(res.percentage).toBe(7)
    expect(res.amount).toBe(700)
    expect(calls.updated).toHaveLength(1)
    expect(calls.updated[0].payload.percentage).toBe(7)
    expect(calls.updated[0].payload.percentage_mode).toBe("MANUAL")
  })

  it("el monto sí se recalcula si cambia el margen", async () => {
    // El % pactado se respeta; lo que la venta genera sigue al margen vigente.
    const { supabase, calls } = makeSupabase({
      referral_commissions: {
        id: "rc-1",
        status: "PENDING",
        percentage: 7,
        percentage_mode: "MANUAL",
      },
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: { default_commission_percentage: 35, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 4000,
      ...base,
    })

    expect(res.amount).toBe(280)
    expect(calls.updated[0].payload.base_amount).toBe(4000)
  })

  it("sin ajuste manual sigue mandando el % del cliente", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: { id: "rc-1", status: "PENDING", percentage: 7, percentage_mode: "AUTO" },
      customers: { referral_partner_id: "p-1", referral_commission_percentage: 20 },
      referral_partners: { default_commission_percentage: 35, active: true },
    })

    const res = await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(res.percentage).toBe(20)
    expect(calls.updated[0].payload.percentage_mode).toBe("AUTO")
  })

  it("una comisión nueva nace en AUTO", async () => {
    const { supabase, calls } = makeSupabase({
      referral_commissions: null,
      customers: { referral_partner_id: "p-1", referral_commission_percentage: null },
      referral_partners: { default_commission_percentage: 10, active: true },
    })

    await createOrUpdateReferralCommission({
      supabase,
      customerId: "cust-1",
      marginAmount: 10000,
      ...base,
    })

    expect(calls.inserted[0].payload.percentage_mode).toBe("AUTO")
  })
})
