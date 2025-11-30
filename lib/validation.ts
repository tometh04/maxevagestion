/**
 * Validation Utilities
 * 
 * Schemas y helpers para validación de inputs en APIs
 */

import { z } from "zod"

/**
 * Schemas comunes para validación
 */
export const schemas = {
  // UUID validation
  uuid: z.string().uuid("ID inválido"),

  // Email validation
  email: z.string().email("Email inválido"),

  // Date validation (ISO string)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (debe ser YYYY-MM-DD)"),

  // Currency validation
  currency: z.enum(["ARS", "USD"], {
    errorMap: () => ({ message: "Moneda debe ser ARS o USD" }),
  }),

  // Status validation para leads
  leadStatus: z.enum(["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"], {
    errorMap: () => ({ message: "Status inválido" }),
  }),

  // Status validation para operations
  operationStatus: z.enum(["DRAFT", "RESERVED", "CONFIRMED", "CANCELLED", "COMPLETED"], {
    errorMap: () => ({ message: "Status inválido" }),
  }),

  // Payment direction
  paymentDirection: z.enum(["INCOME", "EXPENSE"], {
    errorMap: () => ({ message: "Dirección debe ser INCOME o EXPENSE" }),
  }),

  // Payment status
  paymentStatus: z.enum(["PENDING", "PAID", "OVERDUE"], {
    errorMap: () => ({ message: "Status inválido" }),
  }),

  // Positive number
  positiveNumber: z.number().positive("Debe ser un número positivo"),

  // Non-negative number
  nonNegativeNumber: z.number().min(0, "No puede ser negativo"),

  // Pagination
  pagination: z.object({
    limit: z.coerce.number().int().min(1).max(1000).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  }),
}

/**
 * Schema para crear un lead
 */
export const createLeadSchema = z.object({
  contact_name: z.string().min(1, "El nombre es requerido").max(200),
  contact_phone: z.string().optional(),
  contact_email: z.string().email("Email inválido").optional().or(z.literal("")),
  destination: z.string().max(200).optional(),
  region: z.enum(["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]).optional(),
  status: schemas.leadStatus.optional(),
  notes: z.string().max(5000).optional(),
  agency_id: schemas.uuid,
  assigned_seller_id: schemas.uuid.optional(),
  quoted_price: schemas.nonNegativeNumber.optional(),
  has_deposit: z.boolean().optional(),
  deposit_amount: schemas.nonNegativeNumber.optional(),
  deposit_currency: schemas.currency.optional(),
  deposit_method: z.enum(["CASH", "BANK", "MP", "USD", "OTHER"]).optional(),
  deposit_date: schemas.date.optional(),
})

/**
 * Schema para crear una operación
 */
export const createOperationSchema = z.object({
  agency_id: schemas.uuid,
  seller_id: schemas.uuid,
  customer_id: schemas.uuid.optional(),
  lead_id: schemas.uuid.optional(),
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "OTHER"]),
  origin: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  departure_date: schemas.date,
  return_date: schemas.date.optional(),
  passengers: z.number().int().positive().optional(),
  sale_amount_total: schemas.positiveNumber,
  operator_cost: schemas.nonNegativeNumber.optional(),
  currency: schemas.currency,
  sale_currency: schemas.currency.optional(),
  operator_cost_currency: schemas.currency.optional(),
  status: schemas.operationStatus.optional(),
  operator_id: schemas.uuid.optional(),
  seller_secondary_id: schemas.uuid.optional(),
  product_type: z.enum(["AEREO", "HOTEL", "PAQUETE", "CRUCERO", "OTRO"]).optional(),
  checkin_date: schemas.date.optional(),
  checkout_date: schemas.date.optional(),
})

/**
 * Schema para AI Copilot
 */
export const aiCopilotSchema = z.object({
  message: z.string().min(1, "El mensaje es requerido").max(1000, "El mensaje es demasiado largo"),
  agencyId: schemas.uuid.optional(),
})

/**
 * Helper para validar y parsear request body
 */
export async function validateRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
      throw new Error(`Validación fallida: ${errors}`)
    }
    throw error
  }
}

/**
 * Helper para validar query parameters
 */
export function validateQueryParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): T {
  try {
    const params = Object.fromEntries(searchParams.entries())
    return schema.parse(params)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
      throw new Error(`Validación de parámetros fallida: ${errors}`)
    }
    throw error
  }
}

