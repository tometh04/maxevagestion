import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

/**
 * GET /api/accounting/monthly-position
 * Obtiene la posición contable mensual (Balance Sheet) agrupada por rubros del plan de cuentas
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())
    const agencyId = searchParams.get("agencyId") || "ALL"

    // Validar mes y año
    if (month < 1 || month > 12) {
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
    }

    // Calcular fecha de corte (último día del mes)
    const lastDay = new Date(year, month, 0).getDate()
    const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    // Obtener todas las cuentas del plan de cuentas activas
    const { data: chartAccounts, error: chartError } = await (supabase.from("chart_of_accounts") as any)
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("display_order", { ascending: true })

    if (chartError) {
      console.error("Error fetching chart of accounts:", chartError)
      return NextResponse.json({ error: "Error al obtener plan de cuentas" }, { status: 500 })
    }

    // Obtener todas las cuentas financieras relacionadas con el plan de cuentas
    let financialAccountsQuery = supabase
      .from("financial_accounts")
      .select(`
        *,
        chart_of_accounts:chart_account_id(
          id,
          account_code,
          account_name,
          category,
          subcategory,
          account_type
        )
      `)
      .eq("is_active", true)
      .not("chart_account_id", "is", null) // Solo cuentas vinculadas al plan de cuentas

    if (agencyId !== "ALL") {
      financialAccountsQuery = financialAccountsQuery.eq("agency_id", agencyId)
    } else {
      // Si es "ALL", incluir cuentas sin agency_id también (cuentas globales)
      // No agregamos filtro adicional, ya que .not("chart_account_id", "is", null) ya filtra
    }

    const { data: financialAccounts, error: faError } = await financialAccountsQuery

    if (faError) {
      console.error("Error fetching financial accounts:", faError)
      return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
    }

    // Obtener movimientos del ledger hasta la fecha de corte
    let ledgerQuery = supabase
      .from("ledger_movements")
      .select(`
        *,
        financial_accounts:account_id(
          id,
          chart_account_id,
          chart_of_accounts:chart_account_id(
            category,
            account_type
          )
        )
      `)
      .lte("created_at", `${dateTo}T23:59:59`)

    if (agencyId !== "ALL") {
      // Filtrar por agencia a través de las cuentas financieras
      const financialAccountsArray = (financialAccounts || []) as any[]
      const accountIds = financialAccountsArray
        .filter((fa: any) => fa.agency_id === agencyId)
        .map((fa: any) => fa.id)
      
      if (accountIds.length > 0) {
        ledgerQuery = ledgerQuery.in("account_id", accountIds)
      } else {
        // Si no hay cuentas, retornar estructura vacía
        return NextResponse.json({
          year,
          month,
          dateTo,
          activo: { corriente: 0, no_corriente: 0, total: 0 },
          pasivo: { corriente: 0, no_corriente: 0, total: 0 },
          patrimonio_neto: { total: 0 },
          resultado: { ingresos: 0, costos: 0, gastos: 0, total: 0 },
          accounts: []
        })
      }
    }

    const { data: movements, error: movementsError } = await ledgerQuery

    if (movementsError) {
      console.error("Error fetching ledger movements:", movementsError)
      return NextResponse.json({ error: "Error al obtener movimientos contables" }, { status: 500 })
    }

    // Calcular balances por categoría y moneda
    const balances: Record<string, number> = {}
    const balancesByCurrency: Record<string, { ars: number; usd: number }> = {}

    // Calcular balances de cuentas financieras
    const financialAccountsArrayForBalance = (financialAccounts || []) as any[]
    console.log(`[MonthlyPosition] Procesando ${financialAccountsArrayForBalance.length} cuentas financieras con chart_account_id`)
    
    for (const account of financialAccountsArrayForBalance) {
      try {
        const balance = await getAccountBalance(account.id, supabase)
        const chartAccount = account.chart_of_accounts
        if (chartAccount) {
          const key = `${chartAccount.category}_${chartAccount.subcategory || "NONE"}`
          balances[key] = (balances[key] || 0) + balance
          
          // Separar por moneda - obtener movimientos y calcular balance por moneda
          if (!balancesByCurrency[key]) {
            balancesByCurrency[key] = { ars: 0, usd: 0 }
          }
          
          // Obtener movimientos para separar por moneda
          const { data: movements } = await supabase
            .from("ledger_movements")
            .select("amount_original, currency, type, amount_ars_equivalent")
            .eq("account_id", account.id)
          
          if (movements && movements.length > 0) {
            const movementsArray = movements as any[]
            let balanceARS = 0
            let balanceUSD = 0
            
            // Calcular balance por moneda usando la misma lógica que getAccountBalance
            const initialBalance = parseFloat(account.initial_balance || "0")
            const accountCurrency = account.currency
            
            // Si la cuenta tiene moneda específica, el initial_balance está en esa moneda
            if (accountCurrency === "ARS") {
              balanceARS = initialBalance
            } else if (accountCurrency === "USD") {
              balanceUSD = initialBalance
            } else {
              balanceARS = initialBalance // Fallback
            }
            
            for (const m of movementsArray) {
              const amountOriginal = parseFloat(m.amount_original || "0")
              const amountARS = parseFloat(m.amount_ars_equivalent || "0")
              
              // Para PASIVOS: EXPENSE aumenta, INCOME disminuye
              if (chartAccount.category === "PASIVO") {
                if (m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT" || m.type === "FX_LOSS") {
                  // Aumenta el pasivo
                  if (m.currency === "ARS") {
                    balanceARS += amountOriginal
                  } else if (m.currency === "USD") {
                    balanceUSD += amountOriginal
                  }
                } else if (m.type === "INCOME" || m.type === "FX_GAIN") {
                  // Disminuye el pasivo
                  if (m.currency === "ARS") {
                    balanceARS -= amountOriginal
                  } else if (m.currency === "USD") {
                    balanceUSD -= amountOriginal
                  }
                }
              } else {
                // Para ACTIVOS y otros: INCOME aumenta, EXPENSE disminuye
                if (m.type === "INCOME" || m.type === "FX_GAIN") {
                  if (m.currency === "ARS") {
                    balanceARS += amountOriginal
                  } else if (m.currency === "USD") {
                    balanceUSD += amountOriginal
                  }
                } else if (m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT" || m.type === "FX_LOSS") {
                  if (m.currency === "ARS") {
                    balanceARS -= amountOriginal
                  } else if (m.currency === "USD") {
                    balanceUSD -= amountOriginal
                  }
                }
              }
            }
            
            balancesByCurrency[key].ars += balanceARS
            balancesByCurrency[key].usd += balanceUSD
          } else {
            // Si no hay movimientos, usar el balance total según la moneda de la cuenta
            if (account.currency === "ARS") {
              balancesByCurrency[key].ars += balance
            } else if (account.currency === "USD") {
              balancesByCurrency[key].usd += balance
            } else {
              balancesByCurrency[key].ars += balance // Fallback
            }
          }
          
          console.log(`[MonthlyPosition] Cuenta ${account.name} (${chartAccount.account_code}): balance=${balance}, key=${key}, ARS=${balancesByCurrency[key].ars}, USD=${balancesByCurrency[key].usd}`)
        } else {
          console.warn(`[MonthlyPosition] Cuenta ${account.id} no tiene chart_of_accounts vinculado`)
        }
      } catch (error) {
        console.error(`Error calculating balance for account ${account.id}:`, error)
      }
    }
    
    // Agregar pagos recurrentes pendientes como pasivos
    try {
      const { data: recurringPayments } = await supabase
        .from("recurring_payments")
        .select("amount, currency, next_due_date, is_active, agency_id")
        .eq("is_active", true)
        .lte("next_due_date", dateTo)
      
      if (recurringPayments && recurringPayments.length > 0) {
        const recurringArray = recurringPayments as any[]
        let recurringARS = 0
        let recurringUSD = 0
        
        for (const rp of recurringArray) {
          // Filtrar por agencia si es necesario
          if (agencyId !== "ALL" && rp.agency_id !== agencyId) {
            continue
          }
          
          const amount = parseFloat(rp.amount || "0")
          if (rp.currency === "ARS") {
            recurringARS += amount
          } else if (rp.currency === "USD") {
            recurringUSD += amount
          }
        }
        
        // Agregar a PASIVO_CORRIENTE (pagos recurrentes son pasivos corrientes)
        if (!balancesByCurrency["PASIVO_CORRIENTE"]) {
          balancesByCurrency["PASIVO_CORRIENTE"] = { ars: 0, usd: 0 }
        }
        balancesByCurrency["PASIVO_CORRIENTE"].ars += recurringARS
        balancesByCurrency["PASIVO_CORRIENTE"].usd += recurringUSD
        
        // También agregar al balance total
        balances["PASIVO_CORRIENTE"] = (balances["PASIVO_CORRIENTE"] || 0) + recurringARS + (recurringUSD * 1000) // Aproximado
        
        console.log(`[MonthlyPosition] Pagos recurrentes pendientes: ARS=${recurringARS}, USD=${recurringUSD}`)
      }
    } catch (error) {
      console.error("Error obteniendo pagos recurrentes:", error)
    }
    
    console.log(`[MonthlyPosition] Balances calculados:`, balances)
    console.log(`[MonthlyPosition] Balances por moneda:`, balancesByCurrency)

    // Calcular resultados del mes (solo movimientos del mes)
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    const { data: monthMovements } = await supabase
      .from("ledger_movements")
      .select(`
        *,
        financial_accounts:account_id(
          chart_of_accounts:chart_account_id(
            category,
            subcategory,
            account_type
          )
        )
      `)
      .gte("created_at", `${monthStart}T00:00:00`)
      .lte("created_at", `${monthEnd}T23:59:59`)

    // Separar por moneda para mostrar correctamente
    let ingresosARS = 0
    let ingresosUSD = 0
    let costosARS = 0
    let costosUSD = 0
    let gastosARS = 0
    let gastosUSD = 0

    const monthMovementsArray = (monthMovements || []) as any[]
    console.log(`[MonthlyPosition] Procesando ${monthMovementsArray.length} movimientos del mes`)
    
    for (const movement of monthMovementsArray) {
      const chartAccount = (movement.financial_accounts as any)?.chart_of_accounts
      if (chartAccount?.category === "RESULTADO") {
        const amountOriginal = parseFloat(movement.amount_original || "0")
        const currency = movement.currency || "ARS"
        
        if (chartAccount.subcategory === "INGRESOS" && movement.type === "INCOME") {
          if (currency === "USD") {
            ingresosUSD += amountOriginal
          } else {
            ingresosARS += amountOriginal
          }
          console.log(`[MonthlyPosition] INGRESO: ${amountOriginal} ${currency} (movement ${movement.id})`)
        } else if (chartAccount.subcategory === "COSTOS" && (movement.type === "EXPENSE" || movement.type === "OPERATOR_PAYMENT")) {
          if (currency === "USD") {
            costosUSD += amountOriginal
          } else {
            costosARS += amountOriginal
          }
          console.log(`[MonthlyPosition] COSTO: ${amountOriginal} ${currency} (movement ${movement.id})`)
        } else if (chartAccount.subcategory === "GASTOS" && movement.type === "EXPENSE") {
          if (currency === "USD") {
            gastosUSD += amountOriginal
          } else {
            gastosARS += amountOriginal
          }
          console.log(`[MonthlyPosition] GASTO: ${amountOriginal} ${currency} (movement ${movement.id})`)
        }
      } else if (!chartAccount) {
        console.warn(`[MonthlyPosition] Movimiento ${movement.id} no tiene chart_account vinculado`)
      }
    }
    
    // Para compatibilidad, sumar todo en ARS (usando amount_ars_equivalent)
    // Pero también devolver desglose por moneda
    let ingresos = 0
    let costos = 0
    let gastos = 0
    
    for (const movement of monthMovementsArray) {
      const chartAccount = (movement.financial_accounts as any)?.chart_of_accounts
      if (chartAccount?.category === "RESULTADO") {
        const amountARS = parseFloat(movement.amount_ars_equivalent || "0")
        if (chartAccount.subcategory === "INGRESOS" && movement.type === "INCOME") {
          ingresos += amountARS
        } else if (chartAccount.subcategory === "COSTOS" && (movement.type === "EXPENSE" || movement.type === "OPERATOR_PAYMENT")) {
          costos += amountARS
        } else if (chartAccount.subcategory === "GASTOS" && movement.type === "EXPENSE") {
          gastos += amountARS
        }
      }
    }
    
    console.log(`[MonthlyPosition] Resultados del mes (ARS): ingresos=${ingresos}, costos=${costos}, gastos=${gastos}`)
    console.log(`[MonthlyPosition] Resultados del mes (desglose): ingresos ARS=${ingresosARS}, USD=${ingresosUSD}, costos ARS=${costosARS}, USD=${costosUSD}`)

    // Estructurar respuesta
    const activo_corriente = balances["ACTIVO_CORRIENTE"] || 0
    const activo_no_corriente = balances["ACTIVO_NO_CORRIENTE"] || 0
    // Obtener balances de pasivos por moneda
    const pasivoCorriente = balancesByCurrency["PASIVO_CORRIENTE"] || { ars: 0, usd: 0 }
    const pasivoNoCorriente = balancesByCurrency["PASIVO_NO_CORRIENTE"] || { ars: 0, usd: 0 }
    
    const pasivo_corriente = balances["PASIVO_CORRIENTE"] || 0
    const pasivo_no_corriente = balances["PASIVO_NO_CORRIENTE"] || 0
    const patrimonio_neto = balances["PATRIMONIO_NETO_NONE"] || 0

    const resultado_mes = ingresos - costos - gastos

    return NextResponse.json({
      year,
      month,
      dateTo,
      activo: {
        corriente: Math.round(activo_corriente * 100) / 100,
        no_corriente: Math.round(activo_no_corriente * 100) / 100,
        total: Math.round((activo_corriente + activo_no_corriente) * 100) / 100,
      },
      pasivo: {
        corriente: { ars: Math.round(pasivoCorriente.ars * 100) / 100, usd: Math.round(pasivoCorriente.usd * 100) / 100 },
        no_corriente: { ars: Math.round(pasivoNoCorriente.ars * 100) / 100, usd: Math.round(pasivoNoCorriente.usd * 100) / 100 },
        total: { ars: Math.round((pasivoCorriente.ars + pasivoNoCorriente.ars) * 100) / 100, usd: Math.round((pasivoCorriente.usd + pasivoNoCorriente.usd) * 100) / 100 },
      },
      patrimonio_neto: {
        total: Math.round(patrimonio_neto * 100) / 100,
      },
      resultado: {
        ingresos: Math.round(ingresos * 100) / 100,
        costos: Math.round(costos * 100) / 100,
        gastos: Math.round(gastos * 100) / 100,
        total: Math.round(resultado_mes * 100) / 100,
        // Desglose por moneda para mostrar correctamente
        ingresosARS: Math.round(ingresosARS * 100) / 100,
        ingresosUSD: Math.round(ingresosUSD * 100) / 100,
        costosARS: Math.round(costosARS * 100) / 100,
        costosUSD: Math.round(costosUSD * 100) / 100,
        gastosARS: Math.round(gastosARS * 100) / 100,
        gastosUSD: Math.round(gastosUSD * 100) / 100,
      },
      accounts: chartAccounts || [],
    })
  } catch (error: any) {
    console.error("Error in GET /api/accounting/monthly-position:", error)
    return NextResponse.json({ error: error.message || "Error al obtener posición contable" }, { status: 500 })
  }
}

