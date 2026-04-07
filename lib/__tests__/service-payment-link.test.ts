import { resolveServicePaymentLink } from "@/lib/payments/service-payment-link"

describe("resolveServicePaymentLink", () => {
  it("usa el proveedor y la deuda vinculados al servicio", () => {
    const result = resolveServicePaymentLink({
      operationId: "op-1",
      operationServiceId: "svc-1",
      service: {
        id: "svc-1",
        operation_id: "op-1",
        operator_id: "operator-1",
        operator_payment_id: "debt-1",
      },
    })

    expect(result).toEqual({
      ok: true,
      operatorId: "operator-1",
      operatorPaymentId: "debt-1",
    })
  })

  it("permite servicios con proveedor pero sin deuda ya enlazada", () => {
    const result = resolveServicePaymentLink({
      operationId: "op-1",
      operationServiceId: "svc-1",
      service: {
        id: "svc-1",
        operation_id: "op-1",
        operator_id: "operator-1",
        operator_payment_id: null,
      },
    })

    expect(result).toEqual({
      ok: true,
      operatorId: "operator-1",
      operatorPaymentId: null,
    })
  })

  it("rechaza servicios sin proveedor", () => {
    const result = resolveServicePaymentLink({
      operationId: "op-1",
      operationServiceId: "svc-1",
      service: {
        id: "svc-1",
        operation_id: "op-1",
        operator_id: null,
        operator_payment_id: null,
      },
    })

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "El servicio seleccionado no tiene proveedor asociado. Editá el servicio y asignale uno antes de registrar el pago.",
    })
  })

  it("rechaza servicios de otra operación", () => {
    const result = resolveServicePaymentLink({
      operationId: "op-1",
      operationServiceId: "svc-1",
      service: {
        id: "svc-1",
        operation_id: "op-2",
        operator_id: "operator-1",
        operator_payment_id: null,
      },
    })

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "El servicio seleccionado no pertenece a esta operación",
    })
  })

  it("rechaza un proveedor explícito que contradice al servicio", () => {
    const result = resolveServicePaymentLink({
      operationId: "op-1",
      operationServiceId: "svc-1",
      explicitOperatorId: "operator-2",
      service: {
        id: "svc-1",
        operation_id: "op-1",
        operator_id: "operator-1",
        operator_payment_id: "debt-1",
      },
    })

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "El proveedor enviado no coincide con el proveedor vinculado al servicio seleccionado",
    })
  })

  it("rechaza servicios inexistentes", () => {
    const result = resolveServicePaymentLink({
      operationId: "op-1",
      operationServiceId: "svc-1",
      service: null,
    })

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "El servicio seleccionado no existe o ya no está disponible",
    })
  })
})
