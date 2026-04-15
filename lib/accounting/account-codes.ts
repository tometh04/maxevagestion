/**
 * ACCOUNT CODES - Códigos centralizados del Plan de Cuentas
 *
 * Todos los códigos de cuenta hardcodeados deben referenciarse desde aquí.
 * Evita strings mágicos dispersos en el codebase.
 */

export const ACCOUNT_CODES = {
  // ==========================================
  // ACTIVO (1.x)
  // ==========================================
  CAJA: "1.1.01",
  BANCOS: "1.1.02",
  CUENTAS_POR_COBRAR: "1.1.03",
  MERCADO_PAGO: "1.1.04",
  ACTIVOS_STOCK: "1.1.05",
  ANTICIPOS_PROVEEDORES: "1.1.06",
  IVA_CREDITO: "1.1.07",
  OTROS_CREDITOS: "1.1.08",
  INVERSIONES: "1.2.01",

  // ==========================================
  // PASIVO (2.x)
  // ==========================================
  CUENTAS_POR_PAGAR: "2.1.01",
  IVA_DEBITO: "2.1.02",
  SUELDOS_PAGAR: "2.1.03",
  PERCEPCIONES_AFIP: "2.1.04",
  RETENCIONES: "2.1.05",
  CARGAS_SOCIALES_PAGAR: "2.1.06",
  ANTICIPOS_CLIENTES: "2.1.07",
  IIBB_PAGAR: "2.1.08",
  GANANCIAS_PAGAR: "2.1.09",
  PRESTAMOS_LP: "2.2.01",

  // ==========================================
  // PATRIMONIO NETO (3.x)
  // ==========================================
  CAPITAL_SOCIAL: "3.1.01",
  RESERVAS: "3.1.02",
  RESULTADOS_ACUMULADOS: "3.1.03",
  RESULTADO_EJERCICIO: "3.1.04",

  // ==========================================
  // RESULTADO - INGRESOS (4.1.x)
  // ==========================================
  VENTAS: "4.1.01",
  OTROS_INGRESOS: "4.1.02",
  COMISIONES_GANADAS: "4.1.03",
  INTERESES_GANADOS: "4.1.04",
  DIF_CAMBIO_POSITIVA: "4.1.05",

  // ==========================================
  // RESULTADO - COSTOS (4.2.x)
  // ==========================================
  COSTO_OPERADORES: "4.2.01",
  OTROS_COSTOS: "4.2.02",
  COSTO_HOTELERIA: "4.2.03",
  COSTO_AEREOS: "4.2.04",
  COSTO_TRANSFERS: "4.2.05",
  COSTO_SEGUROS: "4.2.06",
  COSTO_EXCURSIONES: "4.2.07",

  // ==========================================
  // RESULTADO - GASTOS (4.3.x)
  // ==========================================
  GASTOS_ADMIN: "4.3.01",
  GASTOS_COMERC: "4.3.02",
  COMISIONES_VENDEDORES: "4.3.03",
  GASTOS_FINANCIEROS: "4.3.04",
  SUELDOS_JORNALES: "4.3.05",
  CARGAS_SOCIALES_GASTO: "4.3.06",
  ALQUILERES: "4.3.07",
  SERVICIOS: "4.3.08",
  IMPUESTOS_TASAS: "4.3.09",
  SEGUROS_GASTO: "4.3.10",
  AMORTIZACIONES: "4.3.11",
  GASTOS_BANCARIOS: "4.3.12",
  DIF_CAMBIO_NEGATIVA: "4.3.13",
  GASTOS_SISTEMAS: "4.3.14",
  OTROS_GASTOS: "4.3.15",
} as const

export type AccountCode = typeof ACCOUNT_CODES[keyof typeof ACCOUNT_CODES]

/**
 * Categorías que usan lógica de Debe natural (ACTIVO, GASTOS, COSTOS)
 * Debe aumenta el saldo, Haber lo disminuye
 */
export const DEBIT_NATURAL_CATEGORIES = ["ACTIVO"] as const

/**
 * Subcategorías que usan lógica de Debe natural dentro de RESULTADO
 * COSTOS y GASTOS se comportan como ACTIVO (Debe aumenta)
 */
export const DEBIT_NATURAL_SUBCATEGORIES = ["COSTOS", "GASTOS", "EGRESOS"] as const

/**
 * Categorías que usan lógica de Haber natural (PASIVO, PATRIMONIO_NETO, INGRESOS)
 * Haber aumenta el saldo, Debe lo disminuye
 */
export const CREDIT_NATURAL_CATEGORIES = ["PASIVO", "PATRIMONIO_NETO"] as const

/**
 * Subcategorías que usan lógica de Haber natural dentro de RESULTADO
 */
export const CREDIT_NATURAL_SUBCATEGORIES = ["INGRESOS"] as const

/**
 * Determina si una cuenta usa lógica de Debe natural
 * (Debe aumenta el saldo, Haber lo disminuye)
 *
 * Regla contable:
 * - ACTIVO: Debe natural
 * - RESULTADO > COSTOS/GASTOS: Debe natural
 * - PASIVO: Haber natural
 * - PATRIMONIO_NETO: Haber natural
 * - RESULTADO > INGRESOS: Haber natural
 */
export function isDebitNaturalAccount(
  category: string,
  subcategory?: string | null
): boolean {
  if (DEBIT_NATURAL_CATEGORIES.includes(category as any)) {
    return true
  }
  if (category === "RESULTADO" && subcategory) {
    return DEBIT_NATURAL_SUBCATEGORIES.includes(subcategory as any)
  }
  return false
}
