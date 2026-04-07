export interface OperationServicePaymentLinkLike {
  id: string
  operation_id: string
  operator_id: string | null
  operator_payment_id: string | null
}

export type ServicePaymentLinkResolution =
  | {
      ok: true
      operatorId: string
      operatorPaymentId: string | null
    }
  | {
      ok: false
      status: 400 | 404
      error: string
    }

interface ResolveServicePaymentLinkParams {
  operationId?: string | null
  operationServiceId?: string | null
  explicitOperatorId?: string | null
  service?: OperationServicePaymentLinkLike | null
}

export function resolveServicePaymentLink({
  operationId,
  operationServiceId,
  explicitOperatorId,
  service,
}: ResolveServicePaymentLinkParams): ServicePaymentLinkResolution {
  if (!operationServiceId) {
    return {
      ok: false,
      status: 400,
      error: "Debe seleccionar un servicio",
    }
  }

  if (!service) {
    return {
      ok: false,
      status: 404,
      error: "El servicio seleccionado no existe o ya no está disponible",
    }
  }

  if (operationId && service.operation_id !== operationId) {
    return {
      ok: false,
      status: 400,
      error: "El servicio seleccionado no pertenece a esta operación",
    }
  }

  if (!service.operator_id) {
    return {
      ok: false,
      status: 400,
      error: "El servicio seleccionado no tiene proveedor asociado. Editá el servicio y asignale uno antes de registrar el pago.",
    }
  }

  if (explicitOperatorId && explicitOperatorId !== service.operator_id) {
    return {
      ok: false,
      status: 400,
      error: "El proveedor enviado no coincide con el proveedor vinculado al servicio seleccionado",
    }
  }

  return {
    ok: true,
    operatorId: service.operator_id,
    operatorPaymentId: service.operator_payment_id || null,
  }
}
