import {
  agreedPriceFor,
  buildAgreedPriceUpdate,
  clearAgreedPriceUpdate,
} from "./agreed-price"

describe("agreedPriceFor", () => {
  it("devuelve el precio cuando el snapshot corresponde al plan actual", () => {
    const org = { plan: "PRO", agreed_plan_price_ars: 119000, agreed_plan_id: "PRO" }
    expect(agreedPriceFor(org, "PRO")).toBe(119000)
  })

  it("acepta NUMERIC como string (así lo devuelve PostgREST)", () => {
    const org = { plan: "PRO", agreed_plan_price_ars: "119000.00", agreed_plan_id: "PRO" }
    expect(agreedPriceFor(org, "PRO")).toBe(119000)
  })

  it("ignora el snapshot si es de OTRO plan (la org cambió de plan)", () => {
    const org = { plan: "PRO", agreed_plan_price_ars: 450000, agreed_plan_id: "ENTERPRISE" }
    expect(agreedPriceFor(org, "PRO")).toBeNull()
  })

  it("sin snapshot → null (cae al precio de lista)", () => {
    expect(agreedPriceFor({ plan: "PRO" }, "PRO")).toBeNull()
    expect(
      agreedPriceFor({ plan: "PRO", agreed_plan_price_ars: null, agreed_plan_id: null }, "PRO")
    ).toBeNull()
  })

  it("rechaza montos no usables", () => {
    expect(agreedPriceFor({ agreed_plan_price_ars: 0, agreed_plan_id: "PRO" }, "PRO")).toBeNull()
    expect(agreedPriceFor({ agreed_plan_price_ars: -50, agreed_plan_id: "PRO" }, "PRO")).toBeNull()
    expect(agreedPriceFor({ agreed_plan_price_ars: "abc", agreed_plan_id: "PRO" }, "PRO")).toBeNull()
    expect(
      agreedPriceFor({ agreed_plan_price_ars: Infinity, agreed_plan_id: "PRO" }, "PRO")
    ).toBeNull()
  })

  it("org o plan ausentes → null", () => {
    expect(agreedPriceFor(null, "PRO")).toBeNull()
    expect(agreedPriceFor(undefined, "PRO")).toBeNull()
    expect(agreedPriceFor({ agreed_plan_price_ars: 119000, agreed_plan_id: "PRO" }, null)).toBeNull()
  })
})

describe("buildAgreedPriceUpdate", () => {
  const base = {
    plan: "PRO",
    transactionAmount: 119000,
    eventType: "PAYMENT_APPROVED",
    hasCustomPlan: false,
    source: "mp_webhook" as const,
  }

  it("un pago aprobado congela el monto que MP debitó", () => {
    expect(buildAgreedPriceUpdate(base)).toEqual({
      agreed_plan_price_ars: 119000,
      agreed_plan_id: "PRO",
      agreed_plan_price_source: "mp_webhook",
    })
  })

  it("SUBSCRIPTION_AUTHORIZED también establece precio (MP ya autorizó el monto)", () => {
    const patch = buildAgreedPriceUpdate({ ...base, eventType: "SUBSCRIPTION_AUTHORIZED" })
    expect(patch).toMatchObject({ agreed_plan_price_ars: 119000 })
  })

  it("un rechazo o una cancelación NO pisan el precio bueno que ya había", () => {
    expect(buildAgreedPriceUpdate({ ...base, eventType: "PAYMENT_REJECTED" })).toBeNull()
    expect(buildAgreedPriceUpdate({ ...base, eventType: "SUBSCRIPTION_CANCELLED" })).toBeNull()
    expect(buildAgreedPriceUpdate({ ...base, eventType: "PAYMENT_MISSED" })).toBeNull()
    expect(buildAgreedPriceUpdate({ ...base, eventType: "SUBSCRIPTION_CREATED" })).toBeNull()
    expect(buildAgreedPriceUpdate({ ...base, eventType: null })).toBeNull()
  })

  it("no escribe si la org tiene custom plan (ese contrato manda)", () => {
    expect(buildAgreedPriceUpdate({ ...base, hasCustomPlan: true })).toBeNull()
  })

  it("no escribe montos no usables", () => {
    expect(buildAgreedPriceUpdate({ ...base, transactionAmount: 0 })).toBeNull()
    expect(buildAgreedPriceUpdate({ ...base, transactionAmount: null })).toBeNull()
    expect(buildAgreedPriceUpdate({ ...base, transactionAmount: undefined })).toBeNull()
    expect(buildAgreedPriceUpdate({ ...base, transactionAmount: NaN })).toBeNull()
  })

  it("sin plan al que anclar el precio → no escribe", () => {
    expect(buildAgreedPriceUpdate({ ...base, plan: null })).toBeNull()
  })

  it("es idempotente: el mismo webhook repetido escribe el mismo parche", () => {
    expect(buildAgreedPriceUpdate(base)).toEqual(buildAgreedPriceUpdate(base))
  })

  it("el parche resultante se relee con agreedPriceFor", () => {
    const patch = buildAgreedPriceUpdate(base)!
    expect(agreedPriceFor(patch as any, "PRO")).toBe(119000)
  })
})

describe("clearAgreedPriceUpdate", () => {
  it("limpia las tres columnas juntas (el CHECK exige el par completo)", () => {
    expect(clearAgreedPriceUpdate()).toEqual({
      agreed_plan_price_ars: null,
      agreed_plan_id: null,
      agreed_plan_price_source: null,
    })
  })
})
