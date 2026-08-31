/**
 * @jest-environment node
 *
 * Tipo de movimiento del mayor de un pago.
 *
 * La regla es de dos líneas, pero estaba escrita en cuatro lugares y uno se
 * había quedado atrás. Lo que se fija acá es el caso que esa copia vieja
 * ignoraba: la devolución al cliente.
 */
import { paymentLedgerType } from "../ledger-type"

describe("paymentLedgerType", () => {
  it("un cobro al cliente es INCOME", () => {
    expect(paymentLedgerType({ direction: "INCOME", payer_type: "CUSTOMER" })).toBe("INCOME")
  })

  it("un pago a operador es OPERATOR_PAYMENT", () => {
    expect(paymentLedgerType({ direction: "EXPENSE", payer_type: "OPERATOR" })).toBe(
      "OPERATOR_PAYMENT"
    )
  })

  it("una devolución al cliente es EXPENSE, no OPERATOR_PAYMENT", () => {
    // El caso que rompía el borrado: buscaba OPERATOR_PAYMENT y no encontraba
    // nada, así que el egreso quedaba vivo en el mayor.
    expect(paymentLedgerType({ direction: "EXPENSE", payer_type: "CUSTOMER" })).toBe("EXPENSE")
  })

  it("un ingreso desde un operador sigue siendo INCOME", () => {
    // La dirección manda sobre quién es la contraparte: una nota de crédito de
    // un operador entra plata igual.
    expect(paymentLedgerType({ direction: "INCOME", payer_type: "OPERATOR" })).toBe("INCOME")
  })

  it("sin payer_type, una salida se trata como gasto", () => {
    // Defensivo: es lo mismo que hacía el alta antes de extraer la regla.
    expect(paymentLedgerType({ direction: "EXPENSE", payer_type: null })).toBe("EXPENSE")
    expect(paymentLedgerType({ direction: "EXPENSE", payer_type: undefined })).toBe("EXPENSE")
  })

  it("sin direction se trata como salida", () => {
    expect(paymentLedgerType({ direction: null, payer_type: "OPERATOR" })).toBe("OPERATOR_PAYMENT")
    expect(paymentLedgerType({ direction: undefined, payer_type: "CUSTOMER" })).toBe("EXPENSE")
  })
})
