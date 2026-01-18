import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

/**
 * POSICIÓN CONTABLE MENSUAL - VERSIÓN SIMPLIFICADA
 * 
 * ACTIVO:
 *   - Corriente:
 *     - Efectivo USD (suma de cuentas CASH_USD)
 *     - Efectivo ARS (suma de cuentas CASH_ARS)
 *     - Bancos USD (suma de cuentas CHECKING_USD, SAVINGS_USD)
 *     - Bancos ARS (suma de cuentas CHECKING_ARS, SAVINGS_ARS)
 *     - Cuentas por Cobrar (deuda de clientes = venta total - pagos recibidos)
 * 
 * PASIVO:
 *   - Corriente:
 *     - Cuentas por Pagar a Operadores (deuda con operadores = costo total - pagos realizados)
 *     - Gastos Recurrentes Pendientes
 * 
 * PATRIMONIO NETO:
 *   - Activo - Pasivo
 * 
 * RESULTADO DEL MES:
 *   - Ingresos: Pagos recibidos de clientes en el mes
 *   - Costos: Pagos realizados a operadores en el mes
 *   - Gastos: Gastos recurrentes pagados en el mes
 *   - Resultado: Ingresos - Costos - Gastos
 */

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())
    const agencyId = searchParams.get("agencyId") || "ALL"

    console.log(`[MonthlyPosition] Calculando posición para ${month}/${year}, agencia: ${agencyId}`)

    // Fechas del mes
    const lastDay = new Date(year, month, 0).getDate()
    const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`
    const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    // Obtener tipo de cambio mensual (si existe)
    let monthlyExchangeRate: number | null = null
    const { data: exchangeRateData } = await (supabase.from("monthly_exchange_rates") as any)
      .select("usd_to_ars_rate")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle()
    
    if (exchangeRateData?.usd_to_ars_rate) {
      monthlyExchangeRate = parseFloat(exchangeRateData.usd_to_ars_rate)
      console.log(`[MonthlyPosition] TC mensual: ${monthlyExchangeRate}`)
    }

    // Obtener último TC conocido para conversiones
    const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

    // ========================================
    // 1. ACTIVO CORRIENTE
    // ========================================
    
    // 1.1 Efectivo y Bancos - Obtener saldos de cuentas financieras
    let financialAccountsQuery = supabase
      .from("financial_accounts")
      .select("id, name, type, currency, initial_balance, agency_id")
      .eq("is_active", true)
      .in("type", ["CASH_ARS", "CASH_USD", "CHECKING_ARS", "CHECKING_USD", "SAVINGS_ARS", "SAVINGS_USD"])

    if (agencyId !== "ALL") {
      financialAccountsQuery = financialAccountsQuery.eq("agency_id", agencyId)
    }

    const { data: financialAccounts } = await financialAccountsQuery

    let efectivoUSD = 0
    let efectivoARS = 0
    let bancosUSD = 0
    let bancosARS = 0

    if (financialAccounts) {
      for (const account of financialAccounts as any[]) {
        // Calcular balance de la cuenta hasta el fin del mes
        const { data: movements } = await supabase
          .from("ledger_movements")
          .select("amount_original, type, currency")
          .eq("account_id", account.id)
          .lte("created_at", `${dateTo}T23:59:59`)

        let balance = parseFloat(account.initial_balance || "0")
        
        if (movements) {
          for (const m of movements as any[]) {
            const amount = parseFloat(m.amount_original || "0")
            if (m.type === "INCOME" || m.type === "FX_GAIN") {
              balance += amount
            } else if (m.type === "EXPENSE" || m.type === "FX_LOSS" || m.type === "COMMISSION" || m.type === "OPERATOR_PAYMENT") {
              balance -= amount
            }
          }
        }

        // Clasificar por tipo de cuenta
        if (account.type === "CASH_USD") {
          efectivoUSD += balance
        } else if (account.type === "CASH_ARS") {
          efectivoARS += balance
        } else if (account.type === "CHECKING_USD" || account.type === "SAVINGS_USD") {
          bancosUSD += balance
        } else if (account.type === "CHECKING_ARS" || account.type === "SAVINGS_ARS") {
          bancosARS += balance
        }
      }
    }

    console.log(`[MonthlyPosition] Efectivo USD: ${efectivoUSD}, ARS: ${efectivoARS}`)
    console.log(`[MonthlyPosition] Bancos USD: ${bancosUSD}, ARS: ${bancosARS}`)

    // 1.2 Cuentas por Cobrar (deuda de clientes)
    // = Total vendido - Total pagado por clientes
    let operationsQuery = supabase
      .from("operations")
      .select("id, sale_amount_total, sale_currency, currency, operator_cost_total, operator_cost_currency, status, departure_date, agency_id")
      .lte("created_at", `${dateTo}T23:59:59`)
      .neq("status", "CANCELLED")

    if (agencyId !== "ALL") {
      operationsQuery = operationsQuery.eq("agency_id", agencyId)
    }

    const { data: operations } = await operationsQuery

    let totalVentasUSD = 0
    let totalCostosOperadorUSD = 0
    let cuentasPorCobrarUSD = 0
    let cuentasPorPagarUSD = 0

    if (operations && operations.length > 0) {
      const operationIds = operations.map((op: any) => op.id)

      // Obtener todos los pagos de estas operaciones
      const { data: allPayments } = await supabase
        .from("payments")
        .select("operation_id, amount, amount_usd, currency, exchange_rate, status, direction, payer_type")
        .in("operation_id", operationIds)

      // Agrupar pagos por operación
      const paymentsByOp: Record<string, { paidByCustomerUSD: number; paidToOperatorUSD: number }> = {}
      
      if (allPayments) {
        for (const payment of allPayments as any[]) {
          const opId = payment.operation_id
          if (!paymentsByOp[opId]) {
            paymentsByOp[opId] = { paidByCustomerUSD: 0, paidToOperatorUSD: 0 }
          }

          if (payment.status === "PAID") {
            // Convertir a USD
            let amountUSD = 0
            if (payment.amount_usd != null) {
              amountUSD = Number(payment.amount_usd)
            } else if (payment.currency === "USD") {
              amountUSD = Number(payment.amount)
            } else if (payment.currency === "ARS" && payment.exchange_rate) {
              amountUSD = Number(payment.amount) / Number(payment.exchange_rate)
            } else if (payment.currency === "ARS") {
              amountUSD = Number(payment.amount) / latestExchangeRate
            }

            // Clasificar por tipo de pago
            if (payment.direction === "INCOME" && payment.payer_type === "CUSTOMER") {
              paymentsByOp[opId].paidByCustomerUSD += amountUSD
            } else if (payment.direction === "EXPENSE" && payment.payer_type === "OPERATOR") {
              paymentsByOp[opId].paidToOperatorUSD += amountUSD
            }
          }
        }
      }

      // Calcular totales por operación
      for (const op of operations as any[]) {
        const saleCurrency = op.sale_currency || op.currency || "USD"
        const saleAmount = Number(op.sale_amount_total) || 0
        const costCurrency = op.operator_cost_currency || op.currency || "USD"
        const costAmount = Number(op.operator_cost_total) || 0

        // Convertir venta a USD
        let saleUSD = saleAmount
        if (saleCurrency === "ARS") {
          const rate = await getExchangeRate(supabase, new Date(op.departure_date || op.created_at)) || latestExchangeRate
          saleUSD = saleAmount / rate
        }

        // Convertir costo a USD
        let costUSD = costAmount
        if (costCurrency === "ARS") {
          const rate = await getExchangeRate(supabase, new Date(op.departure_date || op.created_at)) || latestExchangeRate
          costUSD = costAmount / rate
        }

        totalVentasUSD += saleUSD
        totalCostosOperadorUSD += costUSD

        // Calcular deudas
        const payments = paymentsByOp[op.id] || { paidByCustomerUSD: 0, paidToOperatorUSD: 0 }
        
        // Cuenta por cobrar = lo que nos deben los clientes
        const debtFromCustomer = Math.max(0, saleUSD - payments.paidByCustomerUSD)
        cuentasPorCobrarUSD += debtFromCustomer

        // Cuenta por pagar = lo que debemos a operadores
        const debtToOperator = Math.max(0, costUSD - payments.paidToOperatorUSD)
        cuentasPorPagarUSD += debtToOperator
      }
    }

    console.log(`[MonthlyPosition] Cuentas por Cobrar (clientes nos deben): USD ${cuentasPorCobrarUSD.toFixed(2)}`)
    console.log(`[MonthlyPosition] Cuentas por Pagar (debemos a operadores): USD ${cuentasPorPagarUSD.toFixed(2)}`)

    // ========================================
    // 2. PASIVO CORRIENTE
    // ========================================

    // 2.1 Gastos Recurrentes Pendientes (próximo vencimiento <= fin del mes)
    let recurringQuery = supabase
      .from("recurring_payments")
      .select("amount, currency, next_due_date")
      .eq("is_active", true)
      .lte("next_due_date", dateTo)

    if (agencyId !== "ALL") {
      recurringQuery = recurringQuery.eq("agency_id", agencyId)
    }

    const { data: recurringPayments } = await recurringQuery

    let gastosRecurrentesPendientesUSD = 0
    let gastosRecurrentesPendientesARS = 0

    if (recurringPayments) {
      for (const rp of recurringPayments as any[]) {
        const amount = parseFloat(rp.amount || "0")
        if (rp.currency === "USD") {
          gastosRecurrentesPendientesUSD += amount
        } else {
          gastosRecurrentesPendientesARS += amount
        }
      }
    }

    // Convertir gastos recurrentes ARS a USD si hay TC
    let gastosRecurrentesTotalUSD = gastosRecurrentesPendientesUSD
    if (monthlyExchangeRate && gastosRecurrentesPendientesARS > 0) {
      gastosRecurrentesTotalUSD += gastosRecurrentesPendientesARS / monthlyExchangeRate
    } else if (gastosRecurrentesPendientesARS > 0) {
      gastosRecurrentesTotalUSD += gastosRecurrentesPendientesARS / latestExchangeRate
    }

    console.log(`[MonthlyPosition] Gastos Recurrentes Pendientes: USD ${gastosRecurrentesPendientesUSD}, ARS ${gastosRecurrentesPendientesARS}`)

    // ========================================
    // 3. RESULTADO DEL MES
    // ========================================

    // Pagos recibidos de clientes en el mes (ingresos)
    let ingresosQuery = supabase
      .from("payments")
      .select("amount, amount_usd, currency, exchange_rate, operation_id")
      .eq("direction", "INCOME")
      .eq("payer_type", "CUSTOMER")
      .eq("status", "PAID")
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`)

    const { data: ingresosPayments } = await ingresosQuery

    let ingresosDelMesUSD = 0
    let ingresosDelMesARS = 0

    if (ingresosPayments) {
      for (const payment of ingresosPayments as any[]) {
        if (payment.currency === "USD") {
          ingresosDelMesUSD += Number(payment.amount)
        } else {
          ingresosDelMesARS += Number(payment.amount)
        }
      }
    }

    // Pagos realizados a operadores en el mes (costos)
    let costosQuery = supabase
      .from("payments")
      .select("amount, amount_usd, currency, exchange_rate, operation_id")
      .eq("direction", "EXPENSE")
      .eq("payer_type", "OPERATOR")
      .eq("status", "PAID")
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`)

    const { data: costosPayments } = await costosQuery

    let costosDelMesUSD = 0
    let costosDelMesARS = 0

    if (costosPayments) {
      for (const payment of costosPayments as any[]) {
        if (payment.currency === "USD") {
          costosDelMesUSD += Number(payment.amount)
        } else {
          costosDelMesARS += Number(payment.amount)
        }
      }
    }

    // Gastos recurrentes pagados en el mes
    // (buscar en ledger_movements relacionados con recurring_payments)
    let gastosDelMesUSD = 0
    let gastosDelMesARS = 0

    // Por ahora, aproximar con gastos que tienen tipo EXPENSE no vinculados a operaciones
    const { data: gastosMovements } = await supabase
      .from("ledger_movements")
      .select("amount_original, currency, description")
      .eq("type", "EXPENSE")
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`)
      .is("operation_id", null)

    if (gastosMovements) {
      for (const gasto of gastosMovements as any[]) {
        if (gasto.currency === "USD") {
          gastosDelMesUSD += parseFloat(gasto.amount_original || "0")
        } else {
          gastosDelMesARS += parseFloat(gasto.amount_original || "0")
        }
      }
    }

    console.log(`[MonthlyPosition] Ingresos del mes: USD ${ingresosDelMesUSD}, ARS ${ingresosDelMesARS}`)
    console.log(`[MonthlyPosition] Costos del mes: USD ${costosDelMesUSD}, ARS ${costosDelMesARS}`)
    console.log(`[MonthlyPosition] Gastos del mes: USD ${gastosDelMesUSD}, ARS ${gastosDelMesARS}`)

    // ========================================
    // 4. CALCULAR TOTALES
    // ========================================

    // Función helper para convertir a USD
    const toUSD = (ars: number, usd: number): number => {
      const rate = monthlyExchangeRate || latestExchangeRate
      return usd + (ars / rate)
    }

    // Activo Corriente (todo en USD)
    const activoCorrienteUSD = toUSD(efectivoARS + bancosARS, efectivoUSD + bancosUSD) + cuentasPorCobrarUSD

    // Pasivo Corriente (todo en USD)
    const pasivoCorrienteUSD = cuentasPorPagarUSD + gastosRecurrentesTotalUSD

    // Patrimonio Neto = Activo - Pasivo
    const patrimonioNetoUSD = activoCorrienteUSD - pasivoCorrienteUSD

    // Resultado del Mes
    const ingresosUSD = toUSD(ingresosDelMesARS, ingresosDelMesUSD)
    const costosUSD = toUSD(costosDelMesARS, costosDelMesUSD)
    const gastosUSD = toUSD(gastosDelMesARS, gastosDelMesUSD)
    const resultadoUSD = ingresosUSD - costosUSD - gastosUSD

    // ========================================
    // 5. RESPUESTA
    // ========================================

    const response = {
      year,
      month,
      agencyId,
      monthlyExchangeRate,
      latestExchangeRate,

      // Desglose detallado
      detalle: {
        efectivo: {
          usd: Math.round(efectivoUSD * 100) / 100,
          ars: Math.round(efectivoARS * 100) / 100,
        },
        bancos: {
          usd: Math.round(bancosUSD * 100) / 100,
          ars: Math.round(bancosARS * 100) / 100,
        },
        cuentasPorCobrar: Math.round(cuentasPorCobrarUSD * 100) / 100,
        cuentasPorPagar: Math.round(cuentasPorPagarUSD * 100) / 100,
        gastosRecurrentesPendientes: {
          usd: Math.round(gastosRecurrentesPendientesUSD * 100) / 100,
          ars: Math.round(gastosRecurrentesPendientesARS * 100) / 100,
        },
      },

      // Resumen por sección
      activo: {
        corriente: Math.round(activoCorrienteUSD * 100) / 100,
        no_corriente: 0,
        total: Math.round(activoCorrienteUSD * 100) / 100,
      },
      pasivo: {
        corriente: Math.round(pasivoCorrienteUSD * 100) / 100,
        no_corriente: 0,
        total: Math.round(pasivoCorrienteUSD * 100) / 100,
      },
      patrimonio_neto: Math.round(patrimonioNetoUSD * 100) / 100,

      // Resultado del mes
      resultado: {
        ingresos: {
          usd: Math.round(ingresosDelMesUSD * 100) / 100,
          ars: Math.round(ingresosDelMesARS * 100) / 100,
          total: Math.round(ingresosUSD * 100) / 100,
        },
        costos: {
          usd: Math.round(costosDelMesUSD * 100) / 100,
          ars: Math.round(costosDelMesARS * 100) / 100,
          total: Math.round(costosUSD * 100) / 100,
        },
        gastos: {
          usd: Math.round(gastosDelMesUSD * 100) / 100,
          ars: Math.round(gastosDelMesARS * 100) / 100,
          total: Math.round(gastosUSD * 100) / 100,
        },
        resultado: Math.round(resultadoUSD * 100) / 100,
      },
    }

    console.log(`[MonthlyPosition] Respuesta:`, JSON.stringify(response, null, 2))

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Error in GET /api/accounting/monthly-position:", error)
    return NextResponse.json({ error: error.message || "Error al obtener posición contable" }, { status: 500 })
  }
}
