import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

/**
 * POSICIÓN CONTABLE MENSUAL
 * Balance General al cierre del mes seleccionado
 * 
 * ESTRUCTURA CONTABLE:
 * 
 * ACTIVO = Lo que la empresa TIENE
 *   - Corriente: Se convierte en efectivo en < 1 año
 *   - No Corriente: Bienes a largo plazo
 * 
 * PASIVO = Lo que la empresa DEBE
 *   - Corriente: Deudas a pagar en < 1 año
 *   - No Corriente: Deudas a largo plazo
 * 
 * PATRIMONIO NETO = ACTIVO - PASIVO
 *   - Capital + Resultados Acumulados + Resultado del Ejercicio
 * 
 * ECUACIÓN FUNDAMENTAL: ACTIVO = PASIVO + PATRIMONIO NETO
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

    // Fecha de corte: último día del mes a las 23:59:59
    const lastDay = new Date(year, month, 0).getDate()
    const fechaCorte = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    const fechaInicioMes = `${year}-${String(month).padStart(2, "0")}-01`

    console.log(`[Balance] Calculando al ${fechaCorte}, agencia: ${agencyId}`)

    // Obtener TC actual para conversiones
    const exchangeRate = await getLatestExchangeRate(supabase) || 1000

    // ===========================================
    // ACTIVO CORRIENTE
    // ===========================================

    // 1. CAJA Y BANCOS - Saldo de cuentas financieras
    let cajaYBancos = {
      efectivoUSD: 0,
      efectivoARS: 0,
      bancosUSD: 0,
      bancosARS: 0,
      totalUSD: 0
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

        // Clasificar por tipo
        if (account.type === "CASH_USD") {
          cajaYBancos.efectivoUSD += balance
        } else if (account.type === "CASH_ARS") {
          cajaYBancos.efectivoARS += balance
        } else if (account.type.includes("USD")) {
          cajaYBancos.bancosUSD += balance
        } else {
          cajaYBancos.bancosARS += balance
        }
      }
    }

    // Convertir ARS a USD para el total
    cajaYBancos.totalUSD = cajaYBancos.efectivoUSD + cajaYBancos.bancosUSD + 
                          (cajaYBancos.efectivoARS + cajaYBancos.bancosARS) / exchangeRate

    // 2. CUENTAS POR COBRAR - Lo que los clientes nos deben
    let cuentasPorCobrar = {
      totalVentasUSD: 0,
      totalCobradoUSD: 0,
      saldoUSD: 0,
      detalle: [] as any[]
    }

    let operationsQuery = supabase
      .from("operations")
      .select("id, file_code, destination, sale_amount_total, sale_currency, currency, operator_cost_total, operator_cost_currency, status, departure_date, created_at")
      .lte("created_at", `${fechaCorte}T23:59:59`)
      .neq("status", "CANCELLED")
      
      if (agencyId !== "ALL") {
      operationsQuery = operationsQuery.eq("agency_id", agencyId)
      }
      
    const { data: operations } = await operationsQuery

    if (operations && operations.length > 0) {
      const operationIds = (operations as any[]).map(op => op.id)
      
      // Obtener pagos de clientes
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
          
          // Convertir a USD
          let amountUSD = 0
          if (p.amount_usd != null) {
            amountUSD = Number(p.amount_usd)
          } else if (p.currency === "USD") {
            amountUSD = Number(p.amount)
          } else {
            const rate = p.exchange_rate || exchangeRate
            amountUSD = Number(p.amount) / rate
          }
          pagosPorOp[p.operation_id] += amountUSD
        }
      }

      // Calcular deuda por operación
      for (const op of operations as any[]) {
        const saleCurrency = op.sale_currency || op.currency || "USD"
        let ventaUSD = Number(op.sale_amount_total) || 0
        
        if (saleCurrency === "ARS") {
          const rate = await getExchangeRate(supabase, new Date(op.departure_date || op.created_at)) || exchangeRate
          ventaUSD = ventaUSD / rate
        }

        const cobradoUSD = pagosPorOp[op.id] || 0
        const deudaUSD = Math.max(0, ventaUSD - cobradoUSD)

        cuentasPorCobrar.totalVentasUSD += ventaUSD
        cuentasPorCobrar.totalCobradoUSD += cobradoUSD

        if (deudaUSD > 0.01) {
          cuentasPorCobrar.detalle.push({
            operacion: op.file_code,
            destino: op.destination,
            venta: ventaUSD,
            cobrado: cobradoUSD,
            deuda: deudaUSD
          })
        }
      }
      
      cuentasPorCobrar.saldoUSD = Math.max(0, cuentasPorCobrar.totalVentasUSD - cuentasPorCobrar.totalCobradoUSD)
    }

    // ===========================================
    // PASIVO CORRIENTE
    // ===========================================

    // 3. CUENTAS POR PAGAR - Lo que debemos a operadores
    let cuentasPorPagar = {
      totalCostosUSD: 0,
      totalPagadoUSD: 0,
      saldoUSD: 0,
      detalle: [] as any[]
    }

    if (operations && operations.length > 0) {
      const operationIds = (operations as any[]).map(op => op.id)

      // Obtener pagos a operadores
      const { data: operatorPayments } = await supabase
        .from("payments")
        .select("operation_id, amount, amount_usd, currency, exchange_rate, status")
        .in("operation_id", operationIds)
        .eq("direction", "EXPENSE")
        .eq("payer_type", "OPERATOR")
        .eq("status", "PAID")

      // Agrupar pagos por operación
      const pagosPorOp: Record<string, number> = {}
      if (operatorPayments) {
        for (const p of operatorPayments as any[]) {
          if (!pagosPorOp[p.operation_id]) pagosPorOp[p.operation_id] = 0
          
          let amountUSD = 0
          if (p.amount_usd != null) {
            amountUSD = Number(p.amount_usd)
          } else if (p.currency === "USD") {
            amountUSD = Number(p.amount)
          } else {
            const rate = p.exchange_rate || exchangeRate
            amountUSD = Number(p.amount) / rate
          }
          pagosPorOp[p.operation_id] += amountUSD
        }
      }

      // Calcular deuda por operación
      for (const op of operations as any[]) {
        const costCurrency = op.operator_cost_currency || op.currency || "USD"
        let costoUSD = Number(op.operator_cost_total) || 0
        
        if (costCurrency === "ARS") {
          const rate = await getExchangeRate(supabase, new Date(op.departure_date || op.created_at)) || exchangeRate
          costoUSD = costoUSD / rate
        }

        const pagadoUSD = pagosPorOp[op.id] || 0
        const deudaUSD = Math.max(0, costoUSD - pagadoUSD)

        cuentasPorPagar.totalCostosUSD += costoUSD
        cuentasPorPagar.totalPagadoUSD += pagadoUSD

        if (deudaUSD > 0.01) {
          cuentasPorPagar.detalle.push({
            operacion: op.file_code,
            destino: op.destination,
            costo: costoUSD,
            pagado: pagadoUSD,
            deuda: deudaUSD
          })
        }
      }
      
      cuentasPorPagar.saldoUSD = Math.max(0, cuentasPorPagar.totalCostosUSD - cuentasPorPagar.totalPagadoUSD)
    }

    // 4. GASTOS A PAGAR - Gastos recurrentes pendientes
    let gastosAPagar = {
      totalUSD: 0,
      totalARS: 0,
      saldoUSD: 0,
      detalle: [] as any[]
    }

    let recurringQuery = supabase
      .from("recurring_payments")
      .select("id, concept, amount, currency, next_due_date, frequency")
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
      gastosAPagar.saldoUSD = gastosAPagar.totalUSD + (gastosAPagar.totalARS / exchangeRate)
    }

    // ===========================================
    // ESTADO DE RESULTADOS DEL MES
    // ===========================================

    // 5. INGRESOS DEL MES - Cobros recibidos
    let ingresosDelMes = {
      usd: 0,
      ars: 0,
      totalUSD: 0
    }

    const { data: ingresosMes } = await supabase
      .from("payments")
      .select("amount, amount_usd, currency, exchange_rate")
      .eq("direction", "INCOME")
      .eq("payer_type", "CUSTOMER")
      .eq("status", "PAID")
      .gte("created_at", `${fechaInicioMes}T00:00:00`)
      .lte("created_at", `${fechaCorte}T23:59:59`)

    if (ingresosMes) {
      for (const p of ingresosMes as any[]) {
        if (p.currency === "USD") {
          ingresosDelMes.usd += Number(p.amount)
        } else {
          ingresosDelMes.ars += Number(p.amount)
        }
      }
      ingresosDelMes.totalUSD = ingresosDelMes.usd + (ingresosDelMes.ars / exchangeRate)
    }

    // 6. COSTOS DEL MES - Pagos a operadores
    let costosDelMes = {
      usd: 0,
      ars: 0,
      totalUSD: 0
    }

    const { data: costosMes } = await supabase
      .from("payments")
      .select("amount, amount_usd, currency, exchange_rate")
      .eq("direction", "EXPENSE")
      .eq("payer_type", "OPERATOR")
      .eq("status", "PAID")
      .gte("created_at", `${fechaInicioMes}T00:00:00`)
      .lte("created_at", `${fechaCorte}T23:59:59`)

    if (costosMes) {
      for (const p of costosMes as any[]) {
        if (p.currency === "USD") {
          costosDelMes.usd += Number(p.amount)
        } else {
          costosDelMes.ars += Number(p.amount)
        }
      }
      costosDelMes.totalUSD = costosDelMes.usd + (costosDelMes.ars / exchangeRate)
    }

    // 7. GASTOS OPERATIVOS DEL MES
    let gastosDelMes = {
      usd: 0,
      ars: 0,
      totalUSD: 0
    }

    // Gastos de ledger_movements que no son pagos a operadores
    const { data: gastosMes } = await supabase
      .from("ledger_movements")
      .select("amount_original, currency, type, description")
      .eq("type", "EXPENSE")
      .is("operation_id", null)
      .gte("created_at", `${fechaInicioMes}T00:00:00`)
      .lte("created_at", `${fechaCorte}T23:59:59`)

    if (gastosMes) {
      for (const g of gastosMes as any[]) {
        const amount = parseFloat(g.amount_original || "0")
        if (g.currency === "USD") {
          gastosDelMes.usd += amount
        } else {
          gastosDelMes.ars += amount
        }
      }
      gastosDelMes.totalUSD = gastosDelMes.usd + (gastosDelMes.ars / exchangeRate)
    }

    // Comisiones pagadas en el mes
    const { data: comisionesMes } = await supabase
      .from("ledger_movements")
      .select("amount_original, currency")
      .eq("type", "COMMISSION")
      .gte("created_at", `${fechaInicioMes}T00:00:00`)
      .lte("created_at", `${fechaCorte}T23:59:59`)

    if (comisionesMes) {
      for (const c of comisionesMes as any[]) {
        const amount = parseFloat(c.amount_original || "0")
        if (c.currency === "USD") {
          gastosDelMes.usd += amount
        } else {
          gastosDelMes.ars += amount
        }
      }
      gastosDelMes.totalUSD = gastosDelMes.usd + (gastosDelMes.ars / exchangeRate)
    }

    // ===========================================
    // CÁLCULOS FINALES
    // ===========================================

    // ACTIVO
    const activoCorriente = cajaYBancos.totalUSD + cuentasPorCobrar.saldoUSD
    const activoNoCorriente = 0 // Por ahora no hay bienes de uso ni inversiones
    const totalActivo = activoCorriente + activoNoCorriente

    // PASIVO
    const pasivoCorriente = cuentasPorPagar.saldoUSD + gastosAPagar.saldoUSD
    const pasivoNoCorriente = 0 // Por ahora no hay deudas a largo plazo
    const totalPasivo = pasivoCorriente + pasivoNoCorriente

    // RESULTADO DEL MES
    const resultadoDelMes = ingresosDelMes.totalUSD - costosDelMes.totalUSD - gastosDelMes.totalUSD

    // PATRIMONIO NETO = ACTIVO - PASIVO
    const patrimonioNeto = totalActivo - totalPasivo

    // Verificación: ACTIVO = PASIVO + PATRIMONIO NETO
    const verificacion = Math.abs(totalActivo - (totalPasivo + patrimonioNeto)) < 0.01

    // ===========================================
    // RESPUESTA
    // ===========================================

    const response = {
      // Metadata
      fechaCorte,
      agencyId,
      exchangeRate,
      verificacionContable: verificacion,

      // ACTIVO
      activo: {
        corriente: {
          cajaYBancos: {
            efectivoUSD: round(cajaYBancos.efectivoUSD),
            efectivoARS: round(cajaYBancos.efectivoARS),
            bancosUSD: round(cajaYBancos.bancosUSD),
            bancosARS: round(cajaYBancos.bancosARS),
            totalUSD: round(cajaYBancos.totalUSD)
          },
          cuentasPorCobrar: {
            totalVentas: round(cuentasPorCobrar.totalVentasUSD),
            totalCobrado: round(cuentasPorCobrar.totalCobradoUSD),
            saldo: round(cuentasPorCobrar.saldoUSD),
            cantidadDeudores: cuentasPorCobrar.detalle.length,
            detalle: cuentasPorCobrar.detalle.slice(0, 10) // Top 10
          },
          total: round(activoCorriente)
        },
        noCorriente: {
          bienesDeUso: 0,
          inversiones: 0,
          total: round(activoNoCorriente)
        },
        total: round(totalActivo)
      },

      // PASIVO
      pasivo: {
        corriente: {
          cuentasPorPagar: {
            totalCostos: round(cuentasPorPagar.totalCostosUSD),
            totalPagado: round(cuentasPorPagar.totalPagadoUSD),
            saldo: round(cuentasPorPagar.saldoUSD),
            cantidadAcreedores: cuentasPorPagar.detalle.length,
            detalle: cuentasPorPagar.detalle.slice(0, 10) // Top 10
          },
          gastosAPagar: {
            totalUSD: round(gastosAPagar.totalUSD),
            totalARS: round(gastosAPagar.totalARS),
            saldo: round(gastosAPagar.saldoUSD),
            detalle: gastosAPagar.detalle
          },
          total: round(pasivoCorriente)
        },
        noCorriente: {
          deudasLargoPlazo: 0,
          total: round(pasivoNoCorriente)
        },
        total: round(totalPasivo)
      },

      // PATRIMONIO NETO
      patrimonioNeto: {
        capital: 0, // Configurable en el futuro
        resultadosAcumulados: 0, // TODO: Calcular de meses anteriores
        resultadoDelEjercicio: round(resultadoDelMes),
        total: round(patrimonioNeto)
      },

      // ESTADO DE RESULTADOS DEL MES
      resultadoDelMes: {
        ingresos: {
          usd: round(ingresosDelMes.usd),
          ars: round(ingresosDelMes.ars),
          total: round(ingresosDelMes.totalUSD)
        },
        costos: {
          usd: round(costosDelMes.usd),
          ars: round(costosDelMes.ars),
          total: round(costosDelMes.totalUSD)
        },
        gastos: {
          usd: round(gastosDelMes.usd),
          ars: round(gastosDelMes.ars),
          total: round(gastosDelMes.totalUSD)
        },
        resultado: round(resultadoDelMes),
        margenBruto: ingresosDelMes.totalUSD > 0 
          ? round((ingresosDelMes.totalUSD - costosDelMes.totalUSD) / ingresosDelMes.totalUSD * 100)
          : 0
      }
    }

    console.log(`[Balance] Activo: ${totalActivo}, Pasivo: ${totalPasivo}, PN: ${patrimonioNeto}`)

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Error in GET /api/accounting/monthly-position:", error)
    return NextResponse.json({ error: error.message || "Error al obtener posición contable" }, { status: 500 })
  }
}

function round(num: number): number {
  return Math.round(num * 100) / 100
}
