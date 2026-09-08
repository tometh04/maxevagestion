/**
 * PLAN DE CUENTAS DEFAULT — plantilla generica para una agencia de viajes en AR
 *
 * Esta constante es la fuente de verdad del plan con el que arranca CUALQUIER
 * organizacion nueva. Antes el plan se clonaba leyendo las cuentas de una org
 * real usada como template (`lozada-viajes`), lo que significaba que el alta de
 * un tenant dependia de los datos de otro tenant: cualquier cuenta que esa
 * agencia agregara a mano —un banco propio, la cuenta de un socio— se le copiaba
 * a la siguiente agencia que se registrara, y sin esa org en la base
 * (development, staging, restore parcial) el alta se quedaba sin plan.
 *
 * Los codigos son los mismos de `ACCOUNT_CODES` en `./account-codes.ts`, que es
 * lo que el motor contable busca por codigo. Un test verifica que todo codigo
 * declarado alla exista aca.
 *
 * COMO AGREGAR UNA CUENTA NUEVA AL PLAN
 * ------------------------------------
 * Son dos cosas, siempre las dos:
 *   1. Agregarla a esta lista  -> la reciben las orgs que se creen de ahora en mas.
 *   2. Una migracion que la inserte para las orgs que YA existen, colgando del
 *      padre de cada org (ver 20260902000001_operator_cost_adjustments.sql).
 * Si se hace solo (1), las agencias vivas nunca la tienen y el asiento que la
 * necesita se saltea en silencio.
 *
 * El mismo plan esta replicado en la funcion SQL `seed_chart_of_accounts_for_org`,
 * que es la red de seguridad a nivel base (trigger AFTER INSERT sobre
 * `organizations`). Las dos listas tienen que decir lo mismo.
 */

export type DefaultChartAccount = {
  code: string
  name: string
  category: "ACTIVO" | "PASIVO" | "PATRIMONIO_NETO" | "RESULTADO" | "ORDEN"
  subcategory: string | null
  accountType: string | null
  level: number
  /** Codigo del padre dentro de esta misma lista. `null` para los rubros. */
  parentCode: string | null
  /** `true` si la cuenta recibe movimientos; `false` si es un rubro de resumen. */
  isMovement: boolean
  displayOrder: number
  description: string
}

export const DEFAULT_CHART_OF_ACCOUNTS: readonly DefaultChartAccount[] = [
  // ==========================================
  // ACTIVO (1.x)
  // ==========================================
  { code: "1.1", name: "ACTIVO CORRIENTE", category: "ACTIVO", subcategory: "CORRIENTE", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 1, description: "Activos que se espera convertir en efectivo en menos de un año" },
  { code: "1.1.01", name: "Caja", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "CAJA", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 1, description: "Efectivo en caja" },
  { code: "1.1.02", name: "Bancos", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "BANCO", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 2, description: "Cuentas bancarias" },
  { code: "1.1.03", name: "Cuentas por Cobrar", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "CUENTAS_POR_COBRAR", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 3, description: "Deudas de clientes" },
  { code: "1.1.04", name: "Mercado Pago", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "MERCADO_PAGO", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 4, description: "Saldo en Mercado Pago" },
  { code: "1.1.05", name: "Activos en Stock", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "ACTIVOS_STOCK", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 5, description: "Vouchers, cupos, hoteles en stock" },
  { code: "1.1.06", name: "Anticipos a Proveedores", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "ANTICIPOS_PROVEEDORES", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 6, description: "Anticipos entregados a operadores/proveedores" },
  { code: "1.1.07", name: "IVA Crédito Fiscal", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "IVA_CREDITO", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 7, description: "IVA pagado en compras (crédito fiscal a favor)" },
  { code: "1.1.08", name: "Otros Créditos", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "OTROS_CREDITOS", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 8, description: "Otros créditos a cobrar" },
  { code: "1.1.09", name: "Valores a Depositar", category: "ACTIVO", subcategory: "CORRIENTE", accountType: "CAJA", level: 2, parentCode: "1.1", isMovement: true, displayOrder: 9, description: "Cheques de terceros recibidos y todavia no depositados. No son dinero disponible: pueden rebotar o endosarse." },
  { code: "1.2", name: "ACTIVO NO CORRIENTE", category: "ACTIVO", subcategory: "NO_CORRIENTE", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 2, description: "Activos a largo plazo" },
  { code: "1.2.01", name: "Inversiones", category: "ACTIVO", subcategory: "NO_CORRIENTE", accountType: "INVERSIONES", level: 2, parentCode: "1.2", isMovement: true, displayOrder: 1, description: "Inversiones a largo plazo" },

  // ==========================================
  // PASIVO (2.x)
  // ==========================================
  { code: "2.1", name: "PASIVO CORRIENTE", category: "PASIVO", subcategory: "CORRIENTE", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 1, description: "Obligaciones a pagar en menos de un año" },
  { code: "2.1.01", name: "Cuentas por Pagar", category: "PASIVO", subcategory: "CORRIENTE", accountType: "CUENTAS_POR_PAGAR", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 1, description: "Deudas con operadores y proveedores" },
  { code: "2.1.02", name: "IVA Débito Fiscal", category: "PASIVO", subcategory: "CORRIENTE", accountType: "IVA_PAGAR", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 2, description: "IVA pendiente de pago" },
  { code: "2.1.03", name: "Sueldos a Pagar", category: "PASIVO", subcategory: "CORRIENTE", accountType: "SUELDOS_PAGAR", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 3, description: "Sueldos pendientes de pago" },
  { code: "2.1.04", name: "Percepciones a depositar AFIP", category: "PASIVO", subcategory: "CORRIENTE", accountType: "PERCEPCIONES_AFIP", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 4, description: "Percepciones cobradas a clientes pendientes de depósito a AFIP (RG 5617, RG 3819, etc.)" },
  { code: "2.1.05", name: "Retenciones a Depositar", category: "PASIVO", subcategory: "CORRIENTE", accountType: "RETENCIONES", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 5, description: "Retenciones practicadas pendientes de depósito a AFIP" },
  { code: "2.1.06", name: "Cargas Sociales a Pagar", category: "PASIVO", subcategory: "CORRIENTE", accountType: "CARGAS_SOCIALES", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 6, description: "Aportes y contribuciones patronales pendientes" },
  { code: "2.1.07", name: "Anticipos de Clientes", category: "PASIVO", subcategory: "CORRIENTE", accountType: "ANTICIPOS_CLIENTES", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 7, description: "Cobros anticipados de clientes por servicios no prestados" },
  { code: "2.1.08", name: "IIBB a Pagar", category: "PASIVO", subcategory: "CORRIENTE", accountType: "IIBB", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 8, description: "Ingresos Brutos pendientes de pago" },
  { code: "2.1.09", name: "Impuesto a las Ganancias a Pagar", category: "PASIVO", subcategory: "CORRIENTE", accountType: "GANANCIAS", level: 2, parentCode: "2.1", isMovement: true, displayOrder: 9, description: "Impuesto a las Ganancias pendiente de pago" },
  { code: "2.2", name: "PASIVO NO CORRIENTE", category: "PASIVO", subcategory: "NO_CORRIENTE", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 2, description: "Obligaciones a largo plazo" },
  { code: "2.2.01", name: "Préstamos a Largo Plazo", category: "PASIVO", subcategory: "NO_CORRIENTE", accountType: "PRESTAMOS", level: 2, parentCode: "2.2", isMovement: true, displayOrder: 1, description: "Préstamos bancarios a largo plazo" },

  // ==========================================
  // PATRIMONIO NETO (3.x)
  // ==========================================
  { code: "3.1", name: "PATRIMONIO NETO", category: "PATRIMONIO_NETO", subcategory: null, accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 1, description: "Capital y reservas" },
  { code: "3.1.01", name: "Capital Social", category: "PATRIMONIO_NETO", subcategory: "CAPITAL", accountType: "CAPITAL_SOCIAL", level: 2, parentCode: "3.1", isMovement: true, displayOrder: 1, description: "Capital aportado por socios" },
  { code: "3.1.02", name: "Reservas", category: "PATRIMONIO_NETO", subcategory: "RESERVAS", accountType: "RESERVAS", level: 2, parentCode: "3.1", isMovement: true, displayOrder: 2, description: "Reservas legales y voluntarias" },
  { code: "3.1.03", name: "Resultados Acumulados", category: "PATRIMONIO_NETO", subcategory: "RESULTADOS", accountType: "RESULTADOS_ACUMULADOS", level: 2, parentCode: "3.1", isMovement: true, displayOrder: 3, description: "Ganancias retenidas" },
  { code: "3.1.04", name: "Resultado del Ejercicio", category: "PATRIMONIO_NETO", subcategory: "RESULTADOS", accountType: "RESULTADO_EJERCICIO", level: 2, parentCode: "3.1", isMovement: true, displayOrder: 4, description: "Resultado del ejercicio económico en curso" },

  // ==========================================
  // RESULTADO - INGRESOS (4.1.x)
  // ==========================================
  { code: "4.1", name: "INGRESOS", category: "RESULTADO", subcategory: "INGRESOS", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 1, description: "Ingresos del negocio" },
  { code: "4.1.01", name: "Ventas de Viajes", category: "RESULTADO", subcategory: "INGRESOS", accountType: "VENTAS", level: 2, parentCode: "4.1", isMovement: true, displayOrder: 1, description: "Ingresos por venta de paquetes turísticos" },
  { code: "4.1.02", name: "Otros Ingresos", category: "RESULTADO", subcategory: "INGRESOS", accountType: "OTROS_INGRESOS", level: 2, parentCode: "4.1", isMovement: true, displayOrder: 2, description: "Ingresos no operativos" },
  { code: "4.1.03", name: "Comisiones Ganadas", category: "RESULTADO", subcategory: "INGRESOS", accountType: "COMISIONES_GANADAS", level: 2, parentCode: "4.1", isMovement: true, displayOrder: 3, description: "Comisiones ganadas por intermediación" },
  { code: "4.1.04", name: "Intereses Ganados", category: "RESULTADO", subcategory: "INGRESOS", accountType: "INTERESES_GANADOS", level: 2, parentCode: "4.1", isMovement: true, displayOrder: 4, description: "Intereses por inversiones o plazos fijos" },
  { code: "4.1.05", name: "Diferencia de Cambio Positiva", category: "RESULTADO", subcategory: "INGRESOS", accountType: "DIF_CAMBIO_POS", level: 2, parentCode: "4.1", isMovement: true, displayOrder: 5, description: "Ganancia por variación de tipo de cambio" },
  { code: "4.1.06", name: "Ajuste de Liquidación de Operadores (ganancia)", category: "RESULTADO", subcategory: "INGRESOS", accountType: "AJUSTE_LIQ_POS", level: 2, parentCode: "4.1", isMovement: true, displayOrder: 6, description: "Ganancia por diferencia entre el costo estimado del operador y su liquidación definitiva" },

  // ==========================================
  // RESULTADO - COSTOS (4.2.x)
  // ==========================================
  { code: "4.2", name: "COSTOS", category: "RESULTADO", subcategory: "COSTOS", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 2, description: "Costos directos" },
  { code: "4.2.01", name: "Costo de Operadores", category: "RESULTADO", subcategory: "COSTOS", accountType: "COSTO_OPERADORES", level: 2, parentCode: "4.2", isMovement: true, displayOrder: 1, description: "Costo de servicios de operadores" },
  { code: "4.2.02", name: "Otros Costos", category: "RESULTADO", subcategory: "COSTOS", accountType: "OTROS_COSTOS", level: 2, parentCode: "4.2", isMovement: true, displayOrder: 2, description: "Otros costos directos" },
  { code: "4.2.03", name: "Costo de Hotelería", category: "RESULTADO", subcategory: "COSTOS", accountType: "COSTO_HOTELERIA", level: 2, parentCode: "4.2", isMovement: true, displayOrder: 3, description: "Costos de alojamiento" },
  { code: "4.2.04", name: "Costo de Aéreos", category: "RESULTADO", subcategory: "COSTOS", accountType: "COSTO_AEREOS", level: 2, parentCode: "4.2", isMovement: true, displayOrder: 4, description: "Costos de pasajes aéreos" },
  { code: "4.2.05", name: "Costo de Transfers", category: "RESULTADO", subcategory: "COSTOS", accountType: "COSTO_TRANSFERS", level: 2, parentCode: "4.2", isMovement: true, displayOrder: 5, description: "Costos de traslados" },
  { code: "4.2.06", name: "Costo de Seguros", category: "RESULTADO", subcategory: "COSTOS", accountType: "COSTO_SEGUROS", level: 2, parentCode: "4.2", isMovement: true, displayOrder: 6, description: "Costos de seguros de viaje (assist card, etc.)" },
  { code: "4.2.07", name: "Costo de Excursiones", category: "RESULTADO", subcategory: "COSTOS", accountType: "COSTO_EXCURSIONES", level: 2, parentCode: "4.2", isMovement: true, displayOrder: 7, description: "Costos de excursiones y actividades" },

  // ==========================================
  // RESULTADO - GASTOS (4.3.x)
  // ==========================================
  { code: "4.3", name: "GASTOS", category: "RESULTADO", subcategory: "GASTOS", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 3, description: "Gastos operativos" },
  { code: "4.3.01", name: "Gastos Administrativos", category: "RESULTADO", subcategory: "GASTOS", accountType: "GASTOS_ADMIN", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 1, description: "Gastos de administración" },
  { code: "4.3.02", name: "Gastos de Comercialización", category: "RESULTADO", subcategory: "GASTOS", accountType: "GASTOS_COMERC", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 2, description: "Gastos de marketing y ventas" },
  { code: "4.3.03", name: "Comisiones de Vendedores", category: "RESULTADO", subcategory: "GASTOS", accountType: "COMISIONES", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 3, description: "Comisiones pagadas a vendedores" },
  { code: "4.3.04", name: "Gastos Financieros", category: "RESULTADO", subcategory: "GASTOS", accountType: "GASTOS_FINANCIEROS", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 4, description: "Intereses y gastos financieros" },
  { code: "4.3.05", name: "Sueldos y Jornales", category: "RESULTADO", subcategory: "GASTOS", accountType: "SUELDOS", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 5, description: "Sueldos y salarios del personal" },
  { code: "4.3.06", name: "Cargas Sociales", category: "RESULTADO", subcategory: "GASTOS", accountType: "CARGAS_SOCIALES_GASTO", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 6, description: "Aportes y contribuciones patronales" },
  { code: "4.3.07", name: "Alquileres", category: "RESULTADO", subcategory: "GASTOS", accountType: "ALQUILERES", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 7, description: "Alquiler de oficinas y locales" },
  { code: "4.3.08", name: "Servicios (Luz, Gas, Internet)", category: "RESULTADO", subcategory: "GASTOS", accountType: "SERVICIOS", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 8, description: "Servicios públicos y de comunicaciones" },
  { code: "4.3.09", name: "Impuestos y Tasas", category: "RESULTADO", subcategory: "GASTOS", accountType: "IMPUESTOS", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 9, description: "Impuestos y tasas municipales/provinciales" },
  { code: "4.3.10", name: "Seguros", category: "RESULTADO", subcategory: "GASTOS", accountType: "SEGUROS_GASTO", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 10, description: "Seguros de la empresa (responsabilidad civil, etc.)" },
  { code: "4.3.11", name: "Amortizaciones", category: "RESULTADO", subcategory: "GASTOS", accountType: "AMORTIZACIONES", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 11, description: "Amortización de bienes de uso" },
  { code: "4.3.12", name: "Gastos Bancarios", category: "RESULTADO", subcategory: "GASTOS", accountType: "GASTOS_BANCARIOS", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 12, description: "Comisiones y mantenimiento bancario" },
  { code: "4.3.13", name: "Diferencia de Cambio Negativa", category: "RESULTADO", subcategory: "GASTOS", accountType: "DIF_CAMBIO_NEG", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 13, description: "Pérdida por variación de tipo de cambio" },
  { code: "4.3.14", name: "Gastos de Sistemas / Software", category: "RESULTADO", subcategory: "GASTOS", accountType: "GASTOS_SISTEMAS", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 14, description: "Licencias, hosting, herramientas digitales" },
  { code: "4.3.15", name: "Otros Gastos", category: "RESULTADO", subcategory: "GASTOS", accountType: "OTROS_GASTOS", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 15, description: "Gastos varios no clasificados" },
  { code: "4.3.16", name: "Ajuste de Liquidación de Operadores (pérdida)", category: "RESULTADO", subcategory: "GASTOS", accountType: "AJUSTE_LIQ_NEG", level: 2, parentCode: "4.3", isMovement: true, displayOrder: 16, description: "Pérdida por diferencia entre el costo estimado del operador y su liquidación definitiva" },

  // ==========================================
  // CUENTAS DE ORDEN (5.x)
  //
  // Van siempre de a pares (deudora contra acreedora) para que se cancelen
  // entre si y se presenten al pie del balance sin distorsionarlo.
  // ==========================================
  { code: "5.1", name: "CUENTAS DE ORDEN DEUDORAS", category: "ORDEN", subcategory: "DEUDORAS", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 1, description: "Compromisos y contingencias que no son activo, pasivo ni resultado. Se presentan al pie del balance." },
  { code: "5.1.01", name: "Ventas Pendientes de Facturar", category: "ORDEN", subcategory: "DEUDORAS", accountType: null, level: 2, parentCode: "5.1", isMovement: true, displayOrder: 1, description: "Ventas devengadas cuyo comprobante todavía no se emitió." },
  { code: "5.1.02", name: "Facturas a Recibir de Operadores", category: "ORDEN", subcategory: "DEUDORAS", accountType: null, level: 2, parentCode: "5.1", isMovement: true, displayOrder: 2, description: "Costo comprometido con operadores sin factura de compra recibida." },
  { code: "5.2", name: "CUENTAS DE ORDEN ACREEDORAS", category: "ORDEN", subcategory: "ACREEDORAS", accountType: null, level: 1, parentCode: null, isMovement: false, displayOrder: 2, description: "Contrapartida de las cuentas de orden deudoras, para que se cancelen entre sí y no distorsionen el balance." },
  { code: "5.2.01", name: "Ventas Pendientes de Facturar por Contra", category: "ORDEN", subcategory: "ACREEDORAS", accountType: null, level: 2, parentCode: "5.2", isMovement: true, displayOrder: 1, description: "Contrapartida de 5.1.01." },
  { code: "5.2.02", name: "Facturas a Recibir de Operadores por Contra", category: "ORDEN", subcategory: "ACREEDORAS", accountType: null, level: 2, parentCode: "5.2", isMovement: true, displayOrder: 2, description: "Contrapartida de 5.1.02." },
]

/** Cuantas cuentas trae el plan default. Util para asserts y logs. */
export const DEFAULT_CHART_ACCOUNT_COUNT = DEFAULT_CHART_OF_ACCOUNTS.length
