/**
 * VIB-149 — Qué salida de plata cuenta como gasto de la agencia.
 *
 * Los dos casos que se fijan acá salieron de medir producción: 219 patas de
 * transferencia por ARS 804.485.115 + USD 646.239, y 29 egresos que el usuario
 * ya había marcado "no es gasto" desde Caja y que igual pesaban como gasto
 * deducible en Ganancias.
 */
import { isAgencyExpenseMovement, nonExpenseReason } from "../agency-expense"

describe("isAgencyExpenseMovement", () => {
  it("un egreso común es gasto", () => {
    expect(isAgencyExpenseMovement({ is_internal_transfer: false, cash_movements: [] })).toBe(true)
  })

  it("un movimiento sin ninguna marca es gasto (respuesta conservadora)", () => {
    expect(isAgencyExpenseMovement({})).toBe(true)
  })

  it("la pata de salida de una transferencia interna NO es gasto", () => {
    expect(isAgencyExpenseMovement({ is_internal_transfer: true })).toBe(false)
    expect(nonExpenseReason({ is_internal_transfer: true })).toBe("INTERNAL_TRANSFER")
  })

  it("un egreso marcado 'no es gasto' en Caja NO es gasto", () => {
    const mov = { is_internal_transfer: false, cash_movements: [{ is_agency_expense: false }] }
    expect(isAgencyExpenseMovement(mov)).toBe(false)
    expect(nonExpenseReason(mov)).toBe("MARKED_NOT_EXPENSE")
  })

  it("un egreso con su cash_movement marcado como gasto sigue siendo gasto", () => {
    expect(
      isAgencyExpenseMovement({ is_internal_transfer: false, cash_movements: [{ is_agency_expense: true }] })
    ).toBe(true)
  })

  it("acepta el embed como objeto suelto y no sólo como array", () => {
    expect(isAgencyExpenseMovement({ cash_movements: { is_agency_expense: false } })).toBe(false)
  })

  it("un embed vacío no convierte el gasto en no-gasto", () => {
    expect(isAgencyExpenseMovement({ cash_movements: null })).toBe(true)
    expect(isAgencyExpenseMovement({ cash_movements: [] })).toBe(true)
  })

  it("is_agency_expense nulo no alcanza para excluir: sólo el false explícito", () => {
    // La columna es NOT NULL en la base, pero un embed puede traer null si la
    // fila no existe. Excluir por null dejaría afuera gastos reales.
    expect(isAgencyExpenseMovement({ cash_movements: [{ is_agency_expense: null }] })).toBe(true)
  })

  it("si un movimiento tiene varios cash_movements, alcanza uno marcado no-gasto", () => {
    expect(
      isAgencyExpenseMovement({
        cash_movements: [{ is_agency_expense: true }, { is_agency_expense: false }],
      })
    ).toBe(false)
  })

  it("sin marcas, no hay motivo de exclusión", () => {
    expect(nonExpenseReason({ is_internal_transfer: false, cash_movements: [] })).toBeNull()
  })
})
