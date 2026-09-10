/**
 * Tests del contrato del resultado financiero.
 *
 * El concepto es el único identificador que tienen estos movimientos: no hay
 * columna que los marque y los históricos de ganancia financiera se cargaron
 * contra cuentas elegidas a mano. Si estos tests se rompen, no es un detalle de
 * formato: significa que el escritor, el lector del reporte y la exclusión del
 * cálculo de Ganancias dejaron de hablar el mismo idioma, y los movimientos ya
 * cargados quedan huérfanos.
 */

import {
  FINANCIAL_COST_CONCEPT_PREFIX,
  FINANCIAL_COST_LIKE,
  FINANCIAL_INCOME_CONCEPT_PREFIX,
  FINANCIAL_INCOME_LIKE,
  buildFinancialCostConcept,
  buildFinancialCostMovement,
  buildFinancialIncomeConcept,
  isFinancialCostConcept,
  isFinancialIncomeConcept,
  isFinancialResultAlreadyRegistered,
} from "../financial-result"

describe("conceptos del resultado financiero", () => {
  it("reconoce los conceptos históricos de ganancia financiera por depósito", () => {
    // Literal exacto que escribe el pago masivo desde antes de este módulo.
    expect(isFinancialIncomeConcept("Ganancia financiera por depósito - REC-1023")).toBe(true)
    expect(isFinancialIncomeConcept("Ganancia financiera por depósito")).toBe(true)
  })

  it("reconoce el costo financiero de la financiera", () => {
    expect(isFinancialCostConcept("Costo financiero por depósito - REC-1023")).toBe(true)
  })

  it("no marca como financiero un gasto recurrente ni un pago a operador", () => {
    expect(isFinancialCostConcept("Gasto recurrente: Alquiler")).toBe(false)
    expect(isFinancialCostConcept("Pago masivo a operador - Operación abc12345")).toBe(false)
    expect(isFinancialCostConcept("Pago por depósito a operador - Operación abc12345")).toBe(false)
    expect(isFinancialIncomeConcept("Cobro de cliente")).toBe(false)
  })

  it("no confunde el costo con la ganancia", () => {
    expect(isFinancialCostConcept(buildFinancialIncomeConcept("REC-1"))).toBe(false)
    expect(isFinancialIncomeConcept(buildFinancialCostConcept("REC-1"))).toBe(false)
  })

  it("tolera concepto vacío o nulo sin romper", () => {
    expect(isFinancialCostConcept(null)).toBe(false)
    expect(isFinancialCostConcept(undefined)).toBe(false)
    expect(isFinancialCostConcept("")).toBe(false)
  })

  it("los patrones LIKE no llevan acentos", () => {
    // El .like() de PostgREST viaja en la URL: mantenerlo ASCII saca de la
    // ecuación cualquier diferencia de encoding entre el cliente y la base.
    expect(FINANCIAL_COST_LIKE).toBe("Costo financiero%")
    expect(FINANCIAL_INCOME_LIKE).toBe("Ganancia financiera%")
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7F]*$/.test(FINANCIAL_COST_LIKE)).toBe(true)
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7F]*$/.test(FINANCIAL_INCOME_LIKE)).toBe(true)
  })

  it("los patrones LIKE cubren los conceptos que se escriben", () => {
    const like = (pattern: string, value: string) =>
      new RegExp(`^${pattern.replace(/%/g, ".*")}$`).test(value)
    expect(like(FINANCIAL_COST_LIKE, buildFinancialCostConcept("REC-9"))).toBe(true)
    expect(like(FINANCIAL_INCOME_LIKE, buildFinancialIncomeConcept("REC-9"))).toBe(true)
  })

  it("mantiene los prefijos que ya están escritos en la base", () => {
    expect(FINANCIAL_INCOME_CONCEPT_PREFIX).toBe("Ganancia financiera por depósito")
    expect(FINANCIAL_COST_CONCEPT_PREFIX).toBe("Costo financiero por depósito")
  })
})

describe("buildFinancialCostMovement", () => {
  const base = {
    orgId: "org-1",
    accountId: "caja-pesos",
    amountArs: 85000,
    method: "CASH" as const,
    receiptNumber: "REC-1023",
    paymentDate: "2026-06-30",
    paymentsCount: 3,
    createdBy: "user-1",
  }

  it("el asiento va en ARS, sin tipo de cambio, contra la caja elegida", () => {
    const mov = buildFinancialCostMovement(base)
    expect(mov.type).toBe("EXPENSE")
    expect(mov.currency).toBe("ARS")
    expect(mov.amount_original).toBe(85000)
    expect(mov.amount_ars_equivalent).toBe(85000)
    // El fee ES pesos, no el resultado de convertir dólares: declarar un TC
    // haría creer en la pantalla de ledger que salió de una conversión.
    expect(mov.exchange_rate).toBeNull()
    expect(mov.account_id).toBe("caja-pesos")
    expect(mov.method).toBe("CASH")
  })

  it("imputa el asiento a la fecha del pago, no a la de carga", () => {
    // Si cayera en NOW(), un lote de junio cargado en julio partiría el neteo:
    // la ganancia en un mes y el costo en el otro.
    expect(buildFinancialCostMovement(base).movement_date).toBe("2026-06-30")
  })

  it("no imputa el costo financiero a ninguna operación", () => {
    const mov = buildFinancialCostMovement(base)
    expect(mov.operation_id).toBeNull()
    expect(mov.operator_id).toBeNull()
    expect(mov.seller_id).toBeNull()
  })

  it("lleva el número de comprobante en el concepto", () => {
    // Es lo que sostiene la guarda de duplicados del pago masivo.
    expect(buildFinancialCostMovement(base).concept).toBe(
      "Costo financiero por depósito - REC-1023"
    )
  })

  it("scopea el asiento al tenant explícitamente", () => {
    expect(buildFinancialCostMovement(base).org_id).toBe("org-1")
  })

  it("redondea el monto a dos decimales", () => {
    const mov = buildFinancialCostMovement({ ...base, amountArs: 85000.456 })
    expect(mov.amount_original).toBe(85000.46)
    expect(mov.amount_ars_equivalent).toBe(85000.46)
  })

  it("sin comprobante deja el concepto sin sufijo colgando", () => {
    const mov = buildFinancialCostMovement({ ...base, receiptNumber: null })
    expect(mov.concept).toBe("Costo financiero por depósito")
    expect(mov.receipt_number).toBeNull()
    expect(isFinancialCostConcept(mov.concept)).toBe(true)
  })
})

/**
 * La guarda de duplicados del resultado financiero.
 *
 * El caso real (Lozada, 10/09/2026): un lote de 24 pagos con el comprobante
 * "1111" —el número que cargan siempre— matcheó contra el costo financiero de
 * OTRO lote del 21/08 y se saltó los $ 110.000, más la ganancia de US$ 671,22
 * contra un movimiento de agosto. Los pagos entraron, la comisión nunca salió
 * de la caja en pesos y la ganancia nunca entró.
 */
describe("isFinancialResultAlreadyRegistered", () => {
  /** Cliente falso que registra los filtros aplicados y devuelve `rows`. */
  function client(rows: any[]) {
    const filtros: Array<{ method: string; args: any[] }> = []
    const builder: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve)
          }
          return (...args: any[]) => {
            filtros.push({ method: String(prop), args })
            return builder
          }
        },
      }
    )
    return { supabase: { from: () => builder } as any, filtros }
  }

  const params = {
    orgId: "org-lozada",
    type: "EXPENSE" as const,
    concept: "Costo financiero por depósito - 1111",
    accountId: "acc-caja-pesos",
    amount: 110000,
    dayStart: "2026-09-10T00:00:00-03:00",
  }

  it("un lote nuevo con el comprobante repetido NO se toma por duplicado", async () => {
    // El del 21/08 no entra en la ventana del día del lote nuevo.
    const { supabase } = client([])

    expect(await isFinancialResultAlreadyRegistered(supabase, params)).toBe(false)
  })

  it("acota por importe y por el día argentino, además del concepto y la cuenta", async () => {
    const { supabase, filtros } = client([])

    await isFinancialResultAlreadyRegistered(supabase, params)

    const eq = (col: string) =>
      filtros.find((f) => f.method === "eq" && f.args[0] === col)?.args[1]
    expect(eq("concept")).toBe("Costo financiero por depósito - 1111")
    expect(eq("account_id")).toBe("acc-caja-pesos")
    expect(eq("amount_original")).toBe(110000)
    expect(eq("org_id")).toBe("org-lozada")

    expect(filtros.find((f) => f.method === "gte")?.args).toEqual([
      "movement_date",
      "2026-09-10T00:00:00-03:00",
    ])
    // Cierra en el día siguiente: un lote sin fecha se asienta con now() y dos
    // envíos del mismo lote no caen en el mismo instante.
    expect(filtros.find((f) => f.method === "lt")?.args).toEqual([
      "movement_date",
      "2026-09-11T00:00:00-03:00",
    ])
  })

  it("el reintento del mismo lote sí es duplicado", async () => {
    const { supabase } = client([{ id: "mov-1" }])

    expect(await isFinancialResultAlreadyRegistered(supabase, params)).toBe(true)
  })

  it("si la lectura falla, se reporta como duplicado", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    const builder: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: any) =>
              Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve)
          }
          return () => builder
        },
      }
    )

    // Un faltante se ve en el cartel y se carga a mano; un duplicado de plata
    // hay que salir a buscarlo.
    expect(await isFinancialResultAlreadyRegistered({ from: () => builder } as any, params)).toBe(
      true
    )
    spy.mockRestore()
  })

  it("sin fecha de pago usa el día de hoy", async () => {
    const { supabase, filtros } = client([])

    await isFinancialResultAlreadyRegistered(supabase, { ...params, dayStart: null })

    const gte = filtros.find((f) => f.method === "gte")?.args[1] as string
    expect(gte).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00-03:00$/)
  })
})
