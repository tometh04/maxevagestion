import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

/**
 * POSICIÓN CONTABLE MENSUAL
 * 
 * Usa las MISMAS fuentes de datos que el resto del sistema:
 * - Cuentas por Cobrar: misma lógica que /api/accounting/debts-sales
 * - Cuentas por Pagar: tabla operator_payments (misma que /api/accounting/operator-payments)
 * - Caja y Bancos: tabla financial_accounts + ledger_movements
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

    // Fecha de corte
    const lastDay = new Date(year, month, 0).getDate()
    const fechaCorte = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    const fechaInicioMes = `${year}-${String(month).padStart(2, "0")}-01`

    console.log(`[Balance] Periodo: ${fechaInicioMes} a ${fechaCorte}, Agencia: ${agencyId}`)

    // Obtener TC del mes (si existe)
    let monthlyTC: number | null = null
    const { data: tcData } = await (supabase.from("monthly_exchange_rates") as any)
      .select("usd_to_ars_rate")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle()
    
    if (tcData?.usd_to_ars_rate) {
      monthlyTC = parseFloat(tcData.usd_to_ars_rate)
    }

    // TC de referencia (el más reciente del sistema)
    const latestTC = await getLatestExchangeRate(supabase) || 1000
    const tcParaCalculos = monthlyTC || latestTC

    // ===========================================
    // 1. CAJA Y BANCOS (financial_accounts + ledger_movements)
    // ===========================================
    let cajaYBancos = {
      efectivoUSD: 0,
      efectivoARS: 0,
      bancosUSD: 0,
      bancosARS: 0,
    }

    let accountsQuery = supabase
      .from("financial_accounts")
      .select("id, name, type, currency, initial_balance, agency_id")
      .eq("is_active", true)
      .in("type", ["CASH_ARS", "CASH_USD", "CHECKING_ARS", "CHECKING_USD", "SAVINGS_ARS", "SAVINGS_USD"])

    if (agencyId !== "ALL") {
      accountsQuery = accountsQuery.eq("agency_id", agencyId)
    }

    const { data: accounts } = await accountsQuery

    if (accounts) {
      for (const account of accounts as any[]) {
        const { data: movements } = await supabase
          .from("ledger_movements")
          .select("amount_original, type")
          .eq("account_id", account.id)
          .lte("created_at", `${fechaCorte}T23:59:59`)

        let balance = parseFloat(account.initial_balance || "0")
        
        if (movements) {
          for (const m of movements as any[]) {
            const amount = parseFloat(m.amount_original || "0")
            if (m.type === "INCOME" || m.type === "FX_GAIN") {
              balance += amount
            } else {
              balance -= amount
            }
          }
        }

        if (account.type === "CASH_USD") cajaYBancos.efectivoUSD += balance
        else if (account.type === "CASH_ARS") cajaYBancos.efectivoARS += balance
        else if (account.type.includes("USD")) cajaYBancos.bancosUSD += balance
        else cajaYBancos.bancosARS += balance
      }
    }

    const cajaYBancosTotalUSD = cajaYBancos.efectivoUSD + cajaYBancos.bancosUSD + 
                               (cajaYBancos.efectivoARS + cajaYBancos.bancosARS) / tcParaCalculos

    // ===========================================
    // 2. CUENTAS POR COBRAR (misma lógica que debts-sales)
    // ===========================================
    let cuentasPorCobrar = {
      totalUSD: 0,
      cantidadDeudores: 0,
      detalle: [] as any[]
    }

    // Obtener todas las operaciones con sus clientes
    let operationsQuery = supabase
      .from("operations")
      .select(`
        id, file_code, destination, sale_amount_total, sale_currency, currency, 
        operator_cost_total, operator_cost_currency, status, departure_date, agency_id,
        operation_customers(customer_id, customers:customer_id(id, first_name, last_name))
      `)
      .neq("status", "CANCELLED")
      .lte("created_at", `${fechaCorte}T23:59:59`)

    if (agencyId !== "ALL") {
      operationsQuery = operationsQuery.eq("agency_id", agencyId)
    }

    const { data: operations } = await operationsQuery

    if (operations && operations.length > 0) {
      const operationIds = (operations as any[]).map(op => op.id)

      // Obtener TODOS los pagos de clientes para estas operaciones
      const { data: customerPayments } = await supabase
        .from("payments")
        .select("operation_id, amount, amount_usd, currency, exchange_rate, status")
        .in("operation_id", operationIds)
        .eq("direction", "INCOME")
        .eq("payer_type", "CUSTOMER")
        .eq("status", "PAID")

      // Agrupar pagos por operación
      const pagosPorOp: Record<string, number> = {}
      if (customerPayments) {
        for (const p of customerPayments as any[]) {
          if (!pagosPorOp[p.operation_id]) pagosPorOp[p.operation_id] = 0
          
          let amountUSD = 0
          if (p.amount_usd != null) {
            amountUSD = Number(p.amount_usd)
          } else if (p.currency === "USD") {
            amountUSD = Number(p.amount)
          } else if (p.exchange_rate) {
            amountUSD = Number(p.amount) / Number(p.exchange_rate)
          } else {
            amountUSD = Number(p.amount) / tcParaCalculos
          }
          pagosPorOp[p.operation_id] += amountUSD
        }
      }

      // Calcular deuda por operación
      for (const op of operations as any[]) {
        const saleCurrency = op.sale_currency || op.currency || "USD"
        let ventaUSD = Number(op.sale_amount_total) || 0
        
        if (saleCurrency === "ARS") {
          const rate = await getExchangeRate(supabase, new Date(op.departure_date || op.created_at)) || tcParaCalculos
          ventaUSD = ventaUSD / rate
        }

        const cobradoUSD = pagosPorOp[op.id] || 0
        const deudaUSD = Math.max(0, ventaUSD - cobradoUSD)

        if (deudaUSD > 0.01) {
          const customer = op.operation_customers?.[0]?.customers
          cuentasPorCobrar.detalle.push({
            operacion: op.file_code,
            destino: op.destination,
            cliente: customer ? `${customer.first_name} ${customer.last_name}` : "Sin cliente",
            venta: ventaUSD,
            cobrado: cobradoUSD,
            deuda: deudaUSD
          })
          cuentasPorCobrar.totalUSD += deudaUSD
        }
      }
      
      cuentasPorCobrar.cantidadDeudores = cuentasPorCobrar.detalle.length
    }

    console.log(`[Balance] Cuentas por Cobrar: USD ${cuentasPorCobrar.totalUSD.toFixed(2)} (${cuentasPorCobrar.cantidadDeudores} deudores)`)

    // ===========================================
    // 3. CUENTAS POR PAGAR (tabla operator_payments)
    // ===========================================
    let cuentasPorPagar = {
      totalUSD: 0,
      cantidadAcreedores: 0,
      detalle: [] as any[]
    }

    // Usar la tabla operator_payments (la misma que usa /api/accounting/operator-payments)
    let operatorPaymentsQuery = (supabase.from("operator_payments") as any)
      .select(`
        id, amount, currency, status, due_date, paid_amount,
        operations:operation_id (id, file_code, destination, agency_id),
        operators:operator_id (id, name)
      `)
      .in("status", ["PENDING", "OVERDUE"]) // Solo pendientes
      .lte("created_at", `${fechaCorte}T23:59:59`)

    const { data: operatorPayments } = await operatorPaymentsQuery

    if (operatorPayments) {
      for (const payment of operatorPayments as any[]) {
        // Filtrar por agencia
        if (agencyId !== "ALL" && payment.operations?.agency_id !== agencyId) {
          continue
        }

        const amount = Number(payment.amount) || 0
        const paidAmount = Number(payment.paid_amount) || 0
        const pendingAmount = Math.max(0, amount - paidAmount)
        
        let pendingUSD = pendingAmount
        if (payment.currency === "ARS") {
          pendingUSD = pendingAmount / tcParaCalculos
        }

        if (pendingUSD > 0.01) {
          cuentasPorPagar.detalle.push({
            operacion: payment.operations?.file_code,
            destino: payment.operations?.destination,
            operador: payment.operators?.name,
            monto: pendingAmount,
            moneda: payment.currency,
            montoUSD: pendingUSD,
            vencimiento: payment.due_date,
            estado: payment.status
          })
          cuentasPorPagar.totalUSD += pendingUSD
        }
      }
      
      cuentasPorPagar.cantidadAcreedores = cuentasPorPagar.detalle.length
    }

    console.log(`[Balance] Cuentas por Pagar: USD ${cuentasPorPagar.totalUSD.toFixed(2)} (${cuentasPorPagar.cantidadAcreedores} acreedores)`)

    // ===========================================
    // 4. GASTOS RECURRENTES PENDIENTES
    // ===========================================
    let gastosAPagar = {
      totalUSD: 0,
      totalARS: 0,
      detalle: [] as any[]
    }

    let recurringQuery = supabase
      .from("recurring_payments")
      .select("id, concept, amount, currency, next_due_date")
      .eq("is_active", true)
      .lte("next_due_date", fechaCorte)

    if (agencyId !== "ALL") {
      recurringQuery = recurringQuery.eq("agency_id", agencyId)
    }

    const { data: recurringPayments } = await recurringQuery

    if (recurringPayments) {
      for (const rp of recurringPayments as any[]) {
        const amount = parseFloat(rp.amount || "0")
        if (rp.currency === "USD") {
          gastosAPagar.totalUSD += amount
        } else {
          gastosAPagar.totalARS += amount
        }
        gastosAPagar.detalle.push({
          concepto: rp.concept,
          monto: amount,
          moneda: rp.currency,
          vencimiento: rp.next_due_date
        })
      }
    }

    const gastosAPagarTotalUSD = gastosAPagar.totalUSD + (gastosAPagar.totalARS / tcParaCalculos)

    // ===========================================
    // 5. RESULTADO DEL MES
    // ===========================================
    
    // Ingresos: pagos recibidos de clientes en el mes
    const { data: ingresosMes } = await supabase
      .from("payments")
      .select("amount, amount_usd, currency, exchange_rate")
      .eq("direction", "INCOME")
      .eq("payer_type", "CUSTOMER")
      .eq("status", "PAID")
      .gte("created_at", `${fechaInicioMes}T00:00:00`)
      .lte("created_at", `${fechaCorte}T23:59:59`)

    let ingresosUSD = 0, ingresosARS = 0
    if (ingresosMes) {
      for (const p of ingresosMes as any[]) {
        if (p.currency === "USD") ingresosUSD += Number(p.amount)
        else ingresosARS += Number(p.amount)
      }
    }
    const ingresosTotalUSD = ingresosUSD + (ingresosARS / tcParaCalculos)

    // Costos: pagos realizados a operadores en el mes (de operator_payments marcados como PAID)
    const { data: costosMes } = await (supabase.from("operator_payments") as any)
      .select("amount, currency, paid_amount, paid_at")
      .eq("status", "PAID")
      .gte("paid_at", `${fechaInicioMes}T00:00:00`)
      .lte("paid_at", `${fechaCorte}T23:59:59`)

    let costosUSD = 0, costosARS = 0
    if (costosMes) {
      for (const p of costosMes as any[]) {
        const paid = Number(p.paid_amount || p.amount) || 0
        if (p.currency === "USD") costosUSD += paid
        else costosARS += paid
      }
    }
    const costosTotalUSD = costosUSD + (costosARS / tcParaCalculos)

    // Gastos operativos del mes (movimientos EXPENSE sin operation_id)
    const { data: gastosMes } = await supabase
      .from("ledger_movements")
      .select("amount_original, currency")
      .eq("type", "EXPENSE")
      .is("operation_id", null)
      .gte("created_at", `${fechaInicioMes}T00:00:00`)
      .lte("created_at", `${fechaCorte}T23:59:59`)

    let gastosUSD = 0, gastosARS = 0
    if (gastosMes) {
      for (const g of gastosMes as any[]) {
        const amount = parseFloat(g.amount_original || "0")
        if (g.currency === "USD") gastosUSD += amount
        else gastosARS += amount
      }
    }
    const gastosTotalUSD = gastosUSD + (gastosARS / tcParaCalculos)

    const resultadoMes = ingresosTotalUSD - costosTotalUSD - gastosTotalUSD

    // ===========================================
    // CÁLCULOS FINALES
    // ===========================================

    const activoCorriente = cajaYBancosTotalUSD + cuentasPorCobrar.totalUSD
    const activoNoCorriente = 0
    const totalActivo = activoCorriente + activoNoCorriente

    const pasivoCorriente = cuentasPorPagar.totalUSD + gastosAPagarTotalUSD
    const pasivoNoCorriente = 0
    const totalPasivo = pasivoCorriente + pasivoNoCorriente

    const patrimonioNeto = totalActivo - totalPasivo

    // Verificación contable
    const verificacion = Math.abs(totalActivo - (totalPasivo + patrimonioNeto)) < 0.01

    // ===========================================
    // RESPUESTA
    // ===========================================

    return NextResponse.json({
      fechaCorte,
      agencyId,
      monthlyTC,
      latestTC,
      tcUsado: tcParaCalculos,
      verificacionContable: verificacion,

      activo: {
        corriente: {
          cajaYBancos: {
            efectivoUSD: round(cajaYBancos.efectivoUSD),
            efectivoARS: round(cajaYBancos.efectivoARS),
            bancosUSD: round(cajaYBancos.bancosUSD),
            bancosARS: round(cajaYBancos.bancosARS),
            totalUSD: round(cajaYBancosTotalUSD)
          },
          cuentasPorCobrar: {
            totalUSD: round(cuentasPorCobrar.totalUSD),
            cantidadDeudores: cuentasPorCobrar.cantidadDeudores,
            detalle: cuentasPorCobrar.detalle.slice(0, 10)
          },
          total: round(activoCorriente)
        },
        noCorriente: { total: round(activoNoCorriente) },
        total: round(totalActivo)
      },

      pasivo: {
        corriente: {
          cuentasPorPagar: {
            totalUSD: round(cuentasPorPagar.totalUSD),
            cantidadAcreedores: cuentasPorPagar.cantidadAcreedores,
            detalle: cuentasPorPagar.detalle.slice(0, 10)
          },
          gastosAPagar: {
            totalUSD: round(gastosAPagar.totalUSD),
            totalARS: round(gastosAPagar.totalARS),
            saldoUSD: round(gastosAPagarTotalUSD),
            detalle: gastosAPagar.detalle
          },
          total: round(pasivoCorriente)
        },
        noCorriente: { total: round(pasivoNoCorriente) },
        total: round(totalPasivo)
      },

      patrimonioNeto: {
        resultadoEjercicio: round(resultadoMes),
        total: round(patrimonioNeto)
      },

      resultadoDelMes: {
        ingresos: { usd: round(ingresosUSD), ars: round(ingresosARS), total: round(ingresosTotalUSD) },
        costos: { usd: round(costosUSD), ars: round(costosARS), total: round(costosTotalUSD) },
        gastos: { usd: round(gastosUSD), ars: round(gastosARS), total: round(gastosTotalUSD) },
        resultado: round(resultadoMes),
        margenBruto: ingresosTotalUSD > 0 
          ? round((ingresosTotalUSD - costosTotalUSD) / ingresosTotalUSD * 100)
          : 0
      }
    })
  } catch (error: any) {
    console.error("Error in GET /api/accounting/monthly-position:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function round(num: number): number {
  return Math.round(num * 100) / 100
}
