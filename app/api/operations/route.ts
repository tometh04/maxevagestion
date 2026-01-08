import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { generateFileCode } from "@/lib/accounting/file-code"
import { transferLeadToOperation, getOrCreateDefaultAccount, createLedgerMovement, calculateARSEquivalent } from "@/lib/accounting/ledger"
import { createSaleIVA, createPurchaseIVA } from "@/lib/accounting/iva"
import { createOperatorPayment, calculateDueDate } from "@/lib/accounting/operator-payments"
import { canPerformAction } from "@/lib/permissions-api"
import { revalidateTag, CACHE_TAGS } from "@/lib/cache"
import { generateMessagesFromAlerts } from "@/lib/whatsapp/alert-messages"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"
import { sendCustomerNotifications } from "@/lib/customers/customer-service"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de escritura
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear operaciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      lead_id,
      agency_id,
      seller_id,
      seller_secondary_id,
      operator_id, // Compatibilidad hacia atrás: operador único
      operators, // Nuevo formato: array de operadores [{operator_id, cost, cost_currency, notes?}]
      type,
      product_type,
      origin,
      destination,
      operation_date,
      departure_date,
      return_date,
      checkin_date,
      checkout_date,
      adults,
      children,
      infants,
      passengers,
      status,
      sale_amount_total,
      operator_cost, // Compatibilidad hacia atrás: costo único
      currency,
      sale_currency,
      operator_cost_currency, // Compatibilidad hacia atrás
      commission_percentage, // Porcentaje de comisión del vendedor
    } = body

    // Obtener configuración de operaciones
    const { data: operationSettings } = await supabase
      .from("operation_settings")
      .select("*")
      .eq("agency_id", agency_id)
      .maybeSingle()

    const settingsData = operationSettings as any

    // Validar campos requeridos según configuración
    if (!agency_id || !seller_id || !type || sale_amount_total === undefined) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Aplicar validaciones de configuración
    if (settingsData?.require_destination && !destination) {
      return NextResponse.json({ error: "El destino es requerido" }, { status: 400 })
    }

    if (settingsData?.require_departure_date && !departure_date) {
      return NextResponse.json({ error: "La fecha de salida es requerida" }, { status: 400 })
    }

    if (settingsData?.require_operator && !operator_id && (!operators || operators.length === 0)) {
      return NextResponse.json({ error: "El operador es requerido" }, { status: 400 })
    }

    // Procesar operadores: soportar formato nuevo (array) y formato antiguo (operator_id + operator_cost)
    let operatorsList: Array<{operator_id: string, cost: number, cost_currency: string, notes?: string}> = []
    let totalOperatorCost = 0
    let finalOperatorCostCurrency = operator_cost_currency || currency || "ARS"
    let primaryOperatorId: string | null = operator_id || null

    if (operators && Array.isArray(operators) && operators.length > 0) {
      // Formato nuevo: array de operadores
      for (const op of operators) {
        if (!op.operator_id || op.cost === undefined) {
          return NextResponse.json({ error: "Cada operador debe tener operator_id y cost" }, { status: 400 })
        }
        if (op.cost < 0) {
          return NextResponse.json({ error: "El costo de operador no puede ser negativo" }, { status: 400 })
        }
        operatorsList.push({
          operator_id: op.operator_id,
          cost: Number(op.cost),
          cost_currency: op.cost_currency || currency || "ARS",
          notes: op.notes || undefined
        })
        totalOperatorCost += Number(op.cost)
        // Usar la moneda del primer operador como moneda principal
        if (operatorsList.length === 1) {
          finalOperatorCostCurrency = op.cost_currency || currency || "ARS"
        }
      }
      // El primer operador es el principal
      if (operatorsList.length > 0) {
        primaryOperatorId = operatorsList[0].operator_id
      }
    } else if (operator_id && operator_cost !== undefined) {
      // Formato antiguo: un solo operador (compatibilidad hacia atrás)
      if (operator_cost < 0) {
        return NextResponse.json({ error: "El costo de operador no puede ser negativo" }, { status: 400 })
      }
      operatorsList.push({
        operator_id: operator_id,
        cost: Number(operator_cost),
        cost_currency: operator_cost_currency || currency || "ARS"
      })
      totalOperatorCost = Number(operator_cost)
      finalOperatorCostCurrency = operator_cost_currency || currency || "ARS"
      primaryOperatorId = operator_id
    } else {
      // Sin operadores: permitir operaciones sin operador (costo = 0)
      totalOperatorCost = 0
    }

    // Validaciones de fechas
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Resetear a medianoche para comparación

    const operationDate = operation_date ? new Date(operation_date) : new Date()
    operationDate.setHours(0, 0, 0, 0)

    const departureDate = new Date(departure_date)
    departureDate.setHours(0, 0, 0, 0)

    // Validar que operation_date no sea futuro
    if (operationDate > today) {
      return NextResponse.json({ error: "La fecha de operación no puede ser futura" }, { status: 400 })
    }

    // Validar que departure_date sea después de operation_date
    if (departureDate < operationDate) {
      return NextResponse.json({ error: "La fecha de salida debe ser posterior a la fecha de operación" }, { status: 400 })
    }

    // Validar que return_date sea después de departure_date (si ambos están presentes)
    if (return_date) {
      const returnDate = new Date(return_date)
      returnDate.setHours(0, 0, 0, 0)
      if (returnDate < departureDate) {
        return NextResponse.json({ error: "La fecha de regreso debe ser posterior a la fecha de salida" }, { status: 400 })
      }
    }

    // Validar que los montos no sean negativos
    if (sale_amount_total < 0) {
      return NextResponse.json({ error: "El monto de venta no puede ser negativo" }, { status: 400 })
    }

    // Check permissions
    if (user.role === "SELLER" && seller_id !== user.id) {
      return NextResponse.json({ error: "No puedes crear operaciones para otros vendedores" }, { status: 403 })
    }

    // Calculate margin usando el costo total de todos los operadores
    const marginAmount = sale_amount_total - totalOperatorCost
    const marginPercentage = sale_amount_total > 0 ? (marginAmount / sale_amount_total) * 100 : 0
    
    // Por defecto, billing_margin es igual a margin (se puede ajustar después)
    const billingMarginAmount = body.billing_margin_amount !== undefined ? body.billing_margin_amount : marginAmount
    const billingMarginPercentage = sale_amount_total > 0 ? (billingMarginAmount / sale_amount_total) * 100 : 0

    // Infer product_type from type if not provided
    const inferredProductType = product_type || (type === 'FLIGHT' ? 'AEREO' : type === 'HOTEL' ? 'HOTEL' : type === 'PACKAGE' ? 'PAQUETE' : type === 'CRUISE' ? 'CRUCERO' : 'OTRO')

    // Use sale_currency, fallback to currency
    const finalSaleCurrency = sale_currency || currency || "ARS"

    const operationData: Record<string, any> = {
      agency_id,
      lead_id: lead_id || null,
      seller_id,
      seller_secondary_id: seller_secondary_id || null,
      operator_id: primaryOperatorId, // Operador principal (compatibilidad hacia atrás)
      type,
      product_type: inferredProductType,
      origin: origin || null,
      destination,
      operation_date: operation_date || new Date().toISOString().split("T")[0], // Fecha de operación (hoy por defecto)
      departure_date,
      return_date: return_date || null,
      checkin_date: checkin_date || null,
      checkout_date: checkout_date || null,
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      passengers: passengers ? JSON.stringify(passengers) : null,
      status: status || settingsData?.default_status || "PRE_RESERVATION",
      sale_amount_total,
      operator_cost: totalOperatorCost, // Costo total de todos los operadores
      currency: currency || "ARS", // Mantener para compatibilidad
      sale_currency: finalSaleCurrency,
      operator_cost_currency: finalOperatorCostCurrency,
      margin_amount: marginAmount,
      margin_percentage: marginPercentage,
      billing_margin_amount: billingMarginAmount,
      billing_margin_percentage: billingMarginPercentage,
    }

    const { data: operation, error: operationError } = await (supabase.from("operations") as any)
      .insert(operationData)
      .select()
      .single()

    if (operationError) {
      console.error("Error creating operation:", operationError)
      return NextResponse.json({ error: "Error al crear operación" }, { status: 500 })
    }

    // Auto-generate file_code after operation is created (so we can use the real ID)
    const op = operation as any
    const fileCode = generateFileCode(op.created_at, op.id)
    await (supabase.from("operations") as any)
      .update({ file_code: fileCode })
      .eq("id", op.id)
    
    // Update operation object with file_code
    op.file_code = fileCode

    // Auto-generate IVA records
    try {
      if (sale_amount_total > 0) {
        // Convertir costo del operador a la misma moneda de venta si es necesario
        let operatorCostForIVA = totalOperatorCost
        if (finalOperatorCostCurrency !== finalSaleCurrency && totalOperatorCost > 0) {
          // Si las monedas son diferentes, necesitamos convertir
          try {
            const exchangeRate = await getExchangeRate(supabase, departure_date)
            if (exchangeRate) {
              if (finalOperatorCostCurrency === "USD" && finalSaleCurrency === "ARS") {
                // Convertir USD a ARS
                operatorCostForIVA = totalOperatorCost * exchangeRate
              } else if (finalOperatorCostCurrency === "ARS" && finalSaleCurrency === "USD") {
                // Convertir ARS a USD
                operatorCostForIVA = totalOperatorCost / exchangeRate
              } else {
                console.warn(`⚠️ Conversión de moneda no soportada: ${finalOperatorCostCurrency} → ${finalSaleCurrency}`)
              }
            } else {
              console.warn(`⚠️ No se encontró tasa de cambio para ${departure_date}, usando costo sin convertir`)
            }
          } catch (error) {
            console.error("Error convirtiendo moneda para IVA:", error)
            // Continuar con el costo sin convertir
          }
        }
        
        await createSaleIVA(
          supabase,
          op.id,
          sale_amount_total,
          finalSaleCurrency,
          departure_date,
          operatorCostForIVA // Pasar el costo del operador (convertido si es necesario) para calcular IVA sobre ganancia
        )
        const ganancia = sale_amount_total - operatorCostForIVA
        console.log(`✅ Created sale IVA record for operation ${operation.id} (IVA sobre ganancia: ${ganancia} ${finalSaleCurrency})`)
      }

      // Crear IVA para cada operador (si hay operadores)
      if (operatorsList.length > 0) {
        for (const operatorData of operatorsList) {
          if (operatorData.cost > 0) {
            try {
        await createPurchaseIVA(
          supabase,
          op.id,
                operatorData.operator_id,
                operatorData.cost,
                operatorData.cost_currency as "ARS" | "USD",
          departure_date
        )
              console.log(`✅ Created purchase IVA record for operator ${operatorData.operator_id} in operation ${operation.id}`)
            } catch (error) {
              console.error(`Error creating IVA for operator ${operatorData.operator_id}:`, error)
            }
          }
        }
      }
    } catch (error) {
      console.error("Error creating IVA records:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Crear registros en operation_operators para múltiples operadores
    if (operatorsList.length > 0) {
      try {
        const operationOperatorsData = operatorsList.map(operatorData => ({
          operation_id: op.id, // ID de la operación creada
          operator_id: operatorData.operator_id,
          cost: operatorData.cost,
          cost_currency: operatorData.cost_currency,
          notes: operatorData.notes || null
        }))
        
        const { error: opOpError } = await (supabase.from("operation_operators") as any)
          .insert(operationOperatorsData)
        
        if (opOpError) {
          console.error("Error creating operation_operators:", opOpError)
        } else {
          console.log(`✅ Created ${operatorsList.length} operation_operators records for operation ${op.id}`)
        }
      } catch (error) {
        console.error("Error creating operation_operators:", error)
      }
    }

    // Auto-generate operator payments para cada operador
    if (operatorsList.length > 0) {
      for (const operatorData of operatorsList) {
        if (operatorData.cost > 0) {
      try {
        const dueDate = calculateDueDate(
          inferredProductType,
              departure_date,
          checkin_date || undefined,
          departure_date
        )

        await createOperatorPayment(
          supabase,
          op.id,
              operatorData.operator_id,
              operatorData.cost,
              operatorData.cost_currency as "ARS" | "USD",
          dueDate,
          `Pago automático generado para operación ${operation.id}`
        )
            console.log(`✅ Created operator payment for operator ${operatorData.operator_id} in operation ${operation.id}, due: ${dueDate}`)
      } catch (error) {
            console.error(`Error creating operator payment for ${operatorData.operator_id}:`, error)
        // No lanzamos error para no romper la creación de la operación
      }
        }
      }
    }

    // Registrar operación en el plan de cuentas (sumarización automática)
    try {
      // 1. Obtener o crear cuenta financiera para "Cuentas por Cobrar"
      const { data: accountsReceivableChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "1.1.03")
        .eq("is_active", true)
        .maybeSingle()

      if (accountsReceivableChart) {
        // Buscar o crear financial_account asociada a esta cuenta del plan
        let accountsReceivableFinancialAccount = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", accountsReceivableChart.id)
          .eq("is_active", true)
          .maybeSingle()

        if (!accountsReceivableFinancialAccount) {
          // Crear financial_account para cuentas por cobrar si no existe
          const { data: newFA } = await (supabase.from("financial_accounts") as any)
            .insert({
              name: "Cuentas por Cobrar",
              type: "ASSETS",
              currency: finalSaleCurrency,
              chart_account_id: accountsReceivableChart.id,
              initial_balance: 0,
              is_active: true,
              created_by: user.id,
            })
            .select("id")
            .single()
          accountsReceivableFinancialAccount = newFA
        }

        // Calcular ARS equivalent para la venta
        let saleExchangeRate: number | null = null
        if (finalSaleCurrency === "USD") {
          saleExchangeRate = await getExchangeRate(supabase, new Date(departure_date))
          if (!saleExchangeRate) {
            saleExchangeRate = await getLatestExchangeRate(supabase)
          }
          if (!saleExchangeRate) saleExchangeRate = 1000
        }
        const saleAmountARS = calculateARSEquivalent(sale_amount_total, finalSaleCurrency as "ARS" | "USD", saleExchangeRate)

        // Crear movimiento de ledger para "Cuentas por Cobrar" (ACTIVO - aumenta)
        await createLedgerMovement(
          {
            operation_id: op.id,
            lead_id: null,
            type: "INCOME",
            concept: `Venta - Operación ${op.file_code || op.id.slice(0, 8)}`,
            currency: finalSaleCurrency as "ARS" | "USD",
            amount_original: sale_amount_total,
            exchange_rate: saleExchangeRate,
            amount_ars_equivalent: saleAmountARS,
            method: "OTHER", // Cuenta por cobrar, no es efectivo aún
            account_id: accountsReceivableFinancialAccount.id,
            seller_id: seller_id,
            operator_id: null,
            receipt_number: null,
            notes: `Operación creada: ${destination}`,
            created_by: user.id,
          },
          supabase
        )
        console.log(`✅ Registered sale in chart of accounts (Accounts Receivable) for operation ${op.id}`)
      }

      // 2. Registrar costos de operadores en "Cuentas por Pagar"
      if (operatorsList.length > 0 && totalOperatorCost > 0) {
        const { data: accountsPayableChart } = await (supabase.from("chart_of_accounts") as any)
          .select("id")
          .eq("account_code", "2.1.01")
          .eq("is_active", true)
          .maybeSingle()

        if (accountsPayableChart) {
          // Buscar o crear financial_account asociada
          let accountsPayableFinancialAccount = await (supabase.from("financial_accounts") as any)
            .select("id")
            .eq("chart_account_id", accountsPayableChart.id)
            .eq("is_active", true)
            .maybeSingle()

          if (!accountsPayableFinancialAccount) {
            const { data: newFA } = await (supabase.from("financial_accounts") as any)
              .insert({
                name: "Cuentas por Pagar",
                type: "ASSETS", // Usar ASSETS como tipo válido - el chart_account_id determina si es activo/pasivo
                currency: finalOperatorCostCurrency,
                chart_account_id: accountsPayableChart.id,
                initial_balance: 0,
                is_active: true,
                created_by: user.id,
              })
              .select("id")
              .single()
            accountsPayableFinancialAccount = newFA
          }

          // Calcular ARS equivalent para el costo total
          let costExchangeRate: number | null = null
          if (finalOperatorCostCurrency === "USD") {
            costExchangeRate = await getExchangeRate(supabase, new Date(departure_date))
            if (!costExchangeRate) {
              costExchangeRate = await getLatestExchangeRate(supabase)
            }
            if (!costExchangeRate) {
              // No usar fallback silencioso - lanzar error para que el usuario sepa
              console.error(`❌ ERROR: No se encontró tasa de cambio para USD en fecha ${departure_date}. Se requiere tasa de cambio para operaciones en USD.`)
              throw new Error("No se encontró tasa de cambio para USD. Por favor, configure una tasa de cambio antes de crear la operación.")
            }
          }
          const costAmountARS = calculateARSEquivalent(totalOperatorCost, finalOperatorCostCurrency as "ARS" | "USD", costExchangeRate)

          // Crear movimiento de ledger para "Cuentas por Pagar" (PASIVO - aumenta)
          await createLedgerMovement(
            {
              operation_id: op.id,
              lead_id: null,
              type: "EXPENSE",
              concept: `Costo de Operadores - Operación ${op.file_code || op.id.slice(0, 8)}`,
              currency: finalOperatorCostCurrency as "ARS" | "USD",
              amount_original: totalOperatorCost,
              exchange_rate: costExchangeRate,
              amount_ars_equivalent: costAmountARS,
              method: "OTHER", // Cuenta por pagar, no es efectivo aún
              account_id: accountsPayableFinancialAccount.id,
              seller_id: seller_id,
              operator_id: primaryOperatorId,
              receipt_number: null,
              notes: `Operación creada: ${destination} - ${operatorsList.length} operador(es)`,
              created_by: user.id,
            },
            supabase
          )
          console.log(`✅ Registered operator costs in chart of accounts (Accounts Payable) for operation ${op.id}`)
        }
      }
    } catch (error) {
      console.error("Error registering operation in chart of accounts:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // NOTA: Los pagos se registran manualmente cuando el cliente paga
    // No se generan automáticamente para evitar confusión

    // Update lead status to WON if lead_id exists
    if (lead_id) {
      // Obtener datos del lead
      const { data: leadData } = await (supabase.from("leads") as any)
        .select("contact_name, contact_phone, contact_email, contact_instagram")
        .eq("id", lead_id)
        .single()
      
      if (leadData) {
        // Buscar si ya existe un cliente con ese email o teléfono
        let customerId: string | null = null
        
        if (leadData.contact_email) {
          const { data: existingByEmail } = await (supabase.from("customers") as any)
            .select("id")
            .eq("email", leadData.contact_email)
            .single()
          
          if (existingByEmail) {
            customerId = existingByEmail.id
          }
        }
        
        if (!customerId && leadData.contact_phone) {
          const { data: existingByPhone } = await (supabase.from("customers") as any)
            .select("id")
            .eq("phone", leadData.contact_phone)
            .single()
          
          if (existingByPhone) {
            customerId = existingByPhone.id
          }
        }
        
        // Si no existe, crear el cliente
        if (!customerId) {
          // Separar nombre en first_name y last_name
          const nameParts = (leadData.contact_name || "").trim().split(" ")
          const firstName = nameParts[0] || "Sin nombre"
          const lastName = nameParts.slice(1).join(" ") || "-"
          
          const { data: newCustomer, error: customerError } = await (supabase.from("customers") as any)
            .insert({
              first_name: firstName,
              last_name: lastName,
              phone: leadData.contact_phone || "",
              email: leadData.contact_email || "",
              instagram_handle: leadData.contact_instagram || null,
            })
            .select()
            .single()
          
          if (!customerError && newCustomer) {
            customerId = newCustomer.id
            console.log(`✅ Created customer ${customerId} from lead ${lead_id}`)
          }
        }
        
        // Validar cliente requerido según configuración
        if (settingsData?.require_customer && !customerId) {
          return NextResponse.json({ error: "Se debe asociar al menos un cliente" }, { status: 400 })
        }

        // Asociar cliente a la operación
        if (customerId) {
          const { data: operationCustomerData, error: operationCustomerError } = await (supabase.from("operation_customers") as any)
            .insert({
              operation_id: operation.id,
              customer_id: customerId,
              role: "MAIN"
            })
            .select()
            .single()
          
          if (operationCustomerError) {
            console.error(`❌ Error associating customer ${customerId} with operation ${operation.id}:`, operationCustomerError)
            // No lanzar error, pero loguear para debug
          } else {
            console.log(`✅ Associated customer ${customerId} with operation ${operation.id}`, operationCustomerData)
            
            // Enviar notificación al cliente si está configurada
            try {
              const { data: customer } = await supabase
                .from("customers")
                .select("*")
                .eq("id", customerId)
                .single()
              
              if (customer) {
                const customerData = customer as any
                const { data: settings } = await supabase
                  .from("customer_settings")
                  .select("*")
                  .eq("agency_id", agency_id)
                  .maybeSingle()
                
                const settingsData = settings as any
                if (settingsData?.notifications) {
                  await sendCustomerNotifications(
                    supabase,
                    'customer_operation_created',
                    {
                      id: customerData.id,
                      first_name: customerData.first_name,
                      last_name: customerData.last_name,
                      email: customerData.email,
                      phone: customerData.phone,
                    },
                    agency_id,
                    settingsData.notifications
                  )
                }
              }
            } catch (error) {
              console.error("Error sending customer notification:", error)
              // No lanzar error, solo loguear
            }
          }
          
          // Transferir documentos del lead al cliente
          try {
            const { data: leadDocuments, error: docsError } = await supabase
              .from("documents")
              .select("id")
              .eq("lead_id", lead_id)
              .is("customer_id", null)
            
            if (!docsError && leadDocuments && leadDocuments.length > 0) {
              const { error: updateDocsError } = await (supabase.from("documents") as any)
                .update({ customer_id: customerId })
                .in("id", leadDocuments.map((d: any) => d.id))
              
              if (!updateDocsError) {
                console.log(`✅ Transferred ${leadDocuments.length} documents from lead ${lead_id} to customer ${customerId}`)
              } else {
                console.error("Error transferring documents:", updateDocsError)
              }
            }
          } catch (error) {
            console.error("Error transferring documents from lead to customer:", error)
          }
          
          // Transferir documentos del lead a la operación también
          try {
            const { data: leadDocsForOp, error: docsOpError } = await supabase
              .from("documents")
              .select("id")
              .eq("lead_id", lead_id)
              .is("operation_id", null)
            
            if (!docsOpError && leadDocsForOp && leadDocsForOp.length > 0) {
              const { error: updateDocsOpError } = await (supabase.from("documents") as any)
                .update({ operation_id: operation.id })
                .in("id", leadDocsForOp.map((d: any) => d.id))
              
              if (!updateDocsOpError) {
                console.log(`✅ Transferred ${leadDocsForOp.length} documents from lead ${lead_id} to operation ${operation.id}`)
              } else {
                console.error("Error transferring documents to operation:", updateDocsOpError)
              }
            }
          } catch (error) {
            console.error("Error transferring documents from lead to operation:", error)
          }
        }
      }
      
      // Actualizar lead a WON
      await (supabase.from("leads") as any).update({ status: "WON" }).eq("id", lead_id)
      
      // Transfer all ledger_movements from lead to operation
      try {
        const result = await transferLeadToOperation(lead_id, operation.id, supabase)
        console.log(`✅ Transferred ${result.transferred} ledger movements from lead ${lead_id} to operation ${operation.id}`)
      } catch (error) {
        console.error("Error transferring ledger movements:", error)
        // No lanzamos error para no romper la creación de la operación
        // pero lo registramos para debugging
      }
    }

    // Generar alertas de requisitos por destino
    try {
      await generateDestinationRequirementAlerts(supabase, operation.id, destination, departure_date, seller_id)
    } catch (error) {
      console.error("Error generating destination requirement alerts:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Generar alertas automáticas (check-in, check-out, cumpleaños)
    try {
      await generateOperationAlerts(supabase, operation.id, {
        departure_date,
        return_date,
        checkin_date,
        checkout_date,
        destination,
        seller_id,
      })
    } catch (error) {
      console.error("Error generating operation alerts:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Generar alertas a 30 días para pagos a operadores y cobros de clientes
    try {
      await generatePaymentAlerts30Days(supabase, operation.id, seller_id, destination)
    } catch (error) {
      console.error("Error generating payment alerts:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Crear registro de comisión del vendedor si se especificó porcentaje
    if (commission_percentage && commission_percentage > 0 && marginAmount > 0) {
      try {
        const commissionAmount = (marginAmount * commission_percentage) / 100
        await (supabase.from("commission_records") as any).insert({
          operation_id: operation.id,
          seller_id: seller_id,
          agency_id: agency_id,
          amount: Math.round(commissionAmount * 100) / 100,
          percentage: commission_percentage,
          status: "PENDING",
          date_calculated: new Date().toISOString(),
        })
        console.log(`✅ Created commission record for operation ${operation.id}: ${commission_percentage}% = ${commissionAmount}`)
      } catch (error) {
        console.error("Error creating commission record:", error)
        // No lanzamos error para no romper la creación de la operación
      }
    }

    // Invalidar caché del dashboard (los KPIs cambian al crear una operación)
    revalidateTag(CACHE_TAGS.DASHBOARD)

    return NextResponse.json({ operation })
  } catch (error) {
    console.error("Error in POST /api/operations:", error)
    return NextResponse.json({ error: "Error al crear operación" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Get user agencies (con caché)
    const { getUserAgencyIds } = await import("@/lib/permissions-api")
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Build query - Optimizado: cargar todas las relaciones en una sola query
    let query = supabase
      .from("operations")
      .select(`
        *,
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name),
        agencies:agency_id(id, name, city),
        leads:lead_id(id, contact_name, destination, trello_url, status),
        operation_customers(
          role,
          customers:customer_id(
            id,
            first_name,
            last_name
          )
        ),
        operation_operators(
          id,
          cost,
          cost_currency,
          notes,
          operators:operator_id(
            id,
            name
          )
        )
      `)
    
    // Inicializar countQuery desde el principio
    let countQuery = supabase
      .from("operations")
      .select("*", { count: "exact", head: true })

    // Apply permissions-based filtering
    const { applyOperationsFilters } = await import("@/lib/permissions-api")
    try {
      query = applyOperationsFilters(query, user, agencyIds)
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Apply filters
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    const sellerId = searchParams.get("sellerId")
    if (sellerId && sellerId !== "ALL") {
      query = query.eq("seller_id", sellerId)
    }

    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    const dateFrom = searchParams.get("dateFrom")
    if (dateFrom) {
      query = query.gte("departure_date", dateFrom)
    }

    const dateTo = searchParams.get("dateTo")
    if (dateTo) {
      query = query.lte("departure_date", dateTo)
    }

    // Filtros por fecha de cobro/pago
    const paymentDateFrom = searchParams.get("paymentDateFrom")
    const paymentDateTo = searchParams.get("paymentDateTo")
    const paymentDateType = searchParams.get("paymentDateType") // "COBRO" | "PAGO" | "VENCIMIENTO"
    
    // Si hay filtros de fecha de cobro/pago, primero obtener los operation_ids que cumplen
    let operationIdsWithPayments: string[] = []
    if (paymentDateFrom || paymentDateTo) {
      if (paymentDateType === "COBRO" || paymentDateType === "PAGO" || paymentDateType === "VENCIMIENTO") {
        let paymentFilterQuery = supabase
          .from("payments")
          .select("operation_id")
        
        if (paymentDateType === "COBRO") {
          paymentFilterQuery = paymentFilterQuery.eq("direction", "INCOME")
          if (paymentDateFrom) {
            paymentFilterQuery = paymentFilterQuery.gte("date_paid", paymentDateFrom)
          }
          if (paymentDateTo) {
            paymentFilterQuery = paymentFilterQuery.lte("date_paid", paymentDateTo)
          }
        } else if (paymentDateType === "PAGO") {
          paymentFilterQuery = paymentFilterQuery.eq("direction", "EXPENSE")
          if (paymentDateFrom) {
            paymentFilterQuery = paymentFilterQuery.gte("date_paid", paymentDateFrom)
          }
          if (paymentDateTo) {
            paymentFilterQuery = paymentFilterQuery.lte("date_paid", paymentDateTo)
          }
        } else if (paymentDateType === "VENCIMIENTO") {
          if (paymentDateFrom) {
            paymentFilterQuery = paymentFilterQuery.gte("date_due", paymentDateFrom)
          }
          if (paymentDateTo) {
            paymentFilterQuery = paymentFilterQuery.lte("date_due", paymentDateTo)
          }
        }
        
        const { data: filteredPayments } = await paymentFilterQuery
        operationIdsWithPayments = Array.from(new Set((filteredPayments || []).map((p: any) => p.operation_id)))
        
        // Aplicar filtro a la query de operaciones
        if (operationIdsWithPayments.length > 0) {
          query = query.in("id", operationIdsWithPayments)
          countQuery = countQuery.in("id", operationIdsWithPayments)
        } else {
          // Si no hay operaciones que cumplan, retornar vacío
          const defaultLimit = 50
          return NextResponse.json({ 
            operations: [],
            pagination: {
              total: 0,
              page: 1,
              limit: defaultLimit,
              totalPages: 0,
              hasMore: false
            }
          })
        }
      }
    }

    // Add pagination: usar page en vez de offset para mejor UX
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const requestedLimit = parseInt(searchParams.get("limit") || "50")
    const limit = Math.min(requestedLimit, 200) // Máximo 200 para mejor rendimiento
    const offset = (page - 1) * limit
    
    // Aplicar mismos filtros al countQuery (ya declarado arriba)
    try {
      countQuery = applyOperationsFilters(countQuery, user, agencyIds)
    } catch {
      // Ignore if filtering fails
    }
    
    // Aplicar mismos filtros al count
    if (status && status !== "ALL") {
      countQuery = countQuery.eq("status", status)
    }
    if (sellerId && sellerId !== "ALL") {
      countQuery = countQuery.eq("seller_id", sellerId)
    }
    if (agencyId && agencyId !== "ALL") {
      countQuery = countQuery.eq("agency_id", agencyId)
    }
    if (dateFrom) {
      countQuery = countQuery.gte("departure_date", dateFrom)
    }
    if (dateTo) {
      countQuery = countQuery.lte("departure_date", dateTo)
    }
    
    // OPTIMIZADO: Ejecutar count y query de datos en paralelo
    const [{ count }, operationsResult] = await Promise.all([
      countQuery,
      query
        .select(`
          *,
          sellers:seller_id(name),
          operators:operator_id(name),
          agencies:agency_id(name),
          leads:lead_id(contact_name, destination, trello_url),
          operation_customers(role, customers:customer_id(id, first_name, last_name)),
          operation_operators(id, cost, cost_currency, notes, operators:operator_id(id, name))
        `)
        .order("operation_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)
    ])

    let { data: operations, error } = operationsResult

    // Si hay error y es porque operation_operators no existe, intentar sin esa relación
    if (error && (error.message?.includes("operation_operators") || error.message?.includes("relation") || error.code === "PGRST116")) {
      console.log("operation_operators table not found, retrying without it...")
      const retryResult = await query
        .select(`
          *,
          sellers:seller_id(name),
          operators:operator_id(name),
          agencies:agency_id(name),
          leads:lead_id(contact_name, destination, trello_url),
          operation_customers(role, customers:customer_id(id, first_name, last_name))
        `)
        .order("operation_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)
      
      if (retryResult.error) {
        console.error("Error fetching operations:", retryResult.error)
        return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
      }
      operations = retryResult.data
      error = null
    }

    if (error) {
      console.error("Error fetching operations:", error)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
    }

    // Obtener IDs de operaciones para buscar pagos
    const operationIds = (operations || []).map((op: any) => op.id)
    
    // Obtener TODOS los pagos de estas operaciones para calcular montos (sin filtros de fecha)
    const { data: payments } = await supabase
      .from("payments")
      .select("operation_id, amount, currency, status, direction, payer_type")
      .in("operation_id", operationIds)
    
    // Agrupar pagos por operación y calcular montos
    const paymentsByOperation: Record<string, { paid: number; pending: number; currency: string }> = {}
    
    if (payments) {
      const paymentsArray = (payments || []) as any[]
      for (const payment of paymentsArray) {
        const opId = payment.operation_id
        if (!paymentsByOperation[opId]) {
          paymentsByOperation[opId] = { paid: 0, pending: 0, currency: payment.currency || "ARS" }
        }
        
        if (payment.direction === "INCOME") {
          // Cobros de clientes
          if (payment.status === "PAID") {
            paymentsByOperation[opId].paid += Number(payment.amount) || 0
          } else {
            paymentsByOperation[opId].pending += Number(payment.amount) || 0
          }
        }
      }
    }
    
    // Enriquecer operaciones con datos de pagos y cliente principal
    const enrichedOperations = (operations || []).map((op: any) => {
      const mainCustomer = op.operation_customers?.find(
        (oc: any) => oc.role === "MAIN"
      )?.customers
      
      const customerName = mainCustomer 
        ? `${mainCustomer.first_name || ""} ${mainCustomer.last_name || ""}`.trim()
        : op.leads?.contact_name || "-"
      
      const paymentData = paymentsByOperation[op.id] || { paid: 0, pending: 0, currency: op.currency || "ARS" }
      
      return {
        ...op,
        customer_name: customerName,
        paid_amount: paymentData.paid,
        pending_amount: paymentData.pending,
      }
    })

    const totalPages = count ? Math.ceil(count / limit) : 0

    return NextResponse.json({ 
      operations: enrichedOperations,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
      }
    })
  } catch (error) {
    console.error("Error in GET /api/operations:", error)
    return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
  }
}

// Mapeo de destinos a códigos de país
const destinationMappings: Record<string, string[]> = {
  "BR": ["brasil", "brazil", "rio", "rio de janeiro", "sao paulo", "são paulo", "florianopolis", "florianópolis", "salvador", "fortaleza", "recife", "buzios", "búzios", "arraial", "porto seguro", "maceió", "maceio", "natal", "foz de iguazu", "foz do iguaçu"],
  "CO": ["colombia", "cartagena", "bogota", "bogotá", "medellin", "medellín", "cali", "san andres", "san andrés", "santa marta"],
  "US": ["estados unidos", "usa", "united states", "miami", "new york", "nueva york", "los angeles", "las vegas", "orlando", "disney", "california", "florida", "texas", "chicago", "boston", "washington", "san francisco", "hawaii", "hawai"],
  "EU": ["europa", "europe", "españa", "spain", "italia", "italy", "francia", "france", "alemania", "germany", "portugal", "grecia", "greece", "holanda", "netherlands", "belgica", "bélgica", "austria", "suiza", "switzerland", "roma", "paris", "barcelona", "madrid", "amsterdam", "berlin", "viena", "vienna", "praga", "prague", "budapest", "atenas", "athens", "lisboa", "lisbon", "venecia", "venice", "florencia", "florence", "milan", "milán"],
  "MX": ["mexico", "méxico", "cancun", "cancún", "riviera maya", "playa del carmen", "los cabos", "cabo san lucas", "puerto vallarta", "ciudad de mexico", "cdmx", "tulum", "cozumel"],
  "CU": ["cuba", "habana", "la habana", "havana", "varadero", "santiago de cuba"],
  "DO": ["republica dominicana", "república dominicana", "dominicana", "punta cana", "santo domingo", "puerto plata", "bayahibe", "la romana", "samana", "samaná"],
  "TH": ["tailandia", "thailand", "bangkok", "phuket", "krabi", "chiang mai", "koh samui", "pattaya"],
  "AU": ["australia", "sydney", "melbourne", "brisbane", "perth", "gold coast", "cairns"],
  "EG": ["egipto", "egypt", "cairo", "el cairo", "luxor", "aswan", "hurghada", "sharm el sheikh"],
}

/**
 * Genera alertas automáticas basadas en los requisitos del destino
 */
async function generateDestinationRequirementAlerts(
  supabase: any,
  operationId: string,
  destination: string,
  departureDate: string,
  sellerId: string
) {
  const destLower = destination.toLowerCase()
  
  // Encontrar códigos de país que matchean con el destino
  const matchingCodes: string[] = []
  for (const [code, keywords] of Object.entries(destinationMappings)) {
    for (const keyword of keywords) {
      if (destLower.includes(keyword) || keyword.includes(destLower)) {
        if (!matchingCodes.includes(code)) {
          matchingCodes.push(code)
        }
        break
      }
    }
  }

  if (matchingCodes.length === 0) {
    console.log(`ℹ️ No se encontraron requisitos para destino: ${destination}`)
    return
  }

  // Buscar requisitos activos y obligatorios para esos destinos
  const { data: requirements, error } = await (supabase.from("destination_requirements") as any)
    .select("*")
    .in("destination_code", matchingCodes)
    .eq("is_active", true)
    .eq("is_required", true)

  if (error || !requirements || requirements.length === 0) {
    console.log(`ℹ️ No hay requisitos obligatorios para: ${matchingCodes.join(", ")}`)
    return
  }

  // Calcular fecha de alerta basada en days_before_trip
  const departure = new Date(departureDate + "T12:00:00")
  const alertsToCreate: any[] = []

  for (const req of requirements) {
    const alertDate = new Date(departure)
    alertDate.setDate(alertDate.getDate() - req.days_before_trip)
    
    // Solo crear alerta si la fecha de alerta es en el futuro
    if (alertDate > new Date()) {
      alertsToCreate.push({
        operation_id: operationId,
        user_id: sellerId,
        type: "DESTINATION_REQUIREMENT",
        description: `${req.requirement_name} (${req.destination_name}) - ${req.description || "Verificar antes del viaje"}`,
        date_due: alertDate.toISOString(),
        status: "PENDING",
      })
    }
  }

  if (alertsToCreate.length > 0) {
    const { data: createdAlerts, error: insertError } = await (supabase.from("alerts") as any).insert(alertsToCreate).select()
    if (insertError) {
      console.error("Error creando alertas de requisitos:", insertError)
    } else {
      console.log(`✅ Creadas ${alertsToCreate.length} alertas de requisitos para operación ${operationId}`)
      
      // Generar mensajes de WhatsApp para las alertas creadas
      if (createdAlerts && createdAlerts.length > 0) {
        try {
          const messagesGenerated = await generateMessagesFromAlerts(supabase, createdAlerts)
          if (messagesGenerated > 0) {
            console.log(`✅ Generados ${messagesGenerated} mensajes de WhatsApp para alertas de requisitos`)
          }
        } catch (error) {
          console.error("Error generando mensajes de WhatsApp para alertas de requisitos:", error)
          // No lanzamos error para no romper la creación de alertas
        }
      }
    }
  }
}

/**
 * Genera alertas a 30 días para pagos a operadores y cobros de clientes
 */
async function generatePaymentAlerts30Days(
  supabase: any,
  operationId: string,
  sellerId: string,
  destination: string
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const alertsToCreate: any[] = []

  // Obtener todos los pagos de la operación
  const { data: payments } = await (supabase.from("payments") as any)
    .select("id, amount, currency, date_due, direction, payer_type, status")
    .eq("operation_id", operationId)
    .eq("status", "PENDING")

  if (!payments || payments.length === 0) {
    return
  }

  for (const payment of payments) {
    const dueDate = new Date(payment.date_due + 'T12:00:00')
    const alertDate = new Date(dueDate)
    alertDate.setDate(alertDate.getDate() - 30)

    // Solo crear alerta si la fecha de alerta es en el futuro
    if (alertDate >= today) {
      if (payment.direction === "INCOME" && payment.payer_type === "CUSTOMER") {
        // Alerta de cobro de cliente
        alertsToCreate.push({
          operation_id: operationId,
          user_id: sellerId,
          type: "PAYMENT_DUE",
          description: `💰 Cobro de cliente: ${payment.currency} ${payment.amount} - ${destination} (Vence: ${payment.date_due})`,
          date_due: alertDate.toISOString().split("T")[0],
          status: "PENDING",
        })
      } else if (payment.direction === "EXPENSE" && payment.payer_type === "OPERATOR") {
        // Alerta de pago a operador
        alertsToCreate.push({
          operation_id: operationId,
          user_id: sellerId,
          type: "OPERATOR_DUE",
          description: `💸 Pago a operador: ${payment.currency} ${payment.amount} - ${destination} (Vence: ${payment.date_due})`,
          date_due: alertDate.toISOString().split("T")[0],
          status: "PENDING",
        })
      }
    }
  }

  // Insertar alertas
  if (alertsToCreate.length > 0) {
    const { data: createdAlerts, error: insertError } = await (supabase.from("alerts") as any).insert(alertsToCreate).select()
    if (insertError) {
      console.error("Error creando alertas de pagos:", insertError)
    } else {
      console.log(`✅ Creadas ${alertsToCreate.length} alertas de pagos a 30 días para operación ${operationId}`)
      
      // Generar mensajes de WhatsApp para las alertas creadas
      if (createdAlerts && createdAlerts.length > 0) {
        try {
          const messagesGenerated = await generateMessagesFromAlerts(supabase, createdAlerts)
          if (messagesGenerated > 0) {
            console.log(`✅ Generados ${messagesGenerated} mensajes de WhatsApp para alertas de pagos`)
          }
        } catch (error) {
          console.error("Error generando mensajes de WhatsApp para alertas de pagos:", error)
          // No lanzamos error para no romper la creación de alertas
        }
      }
    }
  }
}

/**
 * Genera alertas automáticas para una operación (check-in, check-out, cumpleaños)
 */
async function generateOperationAlerts(
  supabase: any,
  operationId: string,
  data: {
    departure_date: string
    return_date?: string | null
    checkin_date?: string | null
    checkout_date?: string | null
    destination: string
    seller_id: string
  }
) {
  const { departure_date, return_date, checkin_date, checkout_date, destination, seller_id } = data
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const alertsToCreate: any[] = []

  // 1. ALERTA DE CHECK-IN (30 días antes de la salida o check-in_date si existe)
  const checkInDate = checkin_date || departure_date
  if (checkInDate) {
    const checkInDateObj = new Date(checkInDate + 'T12:00:00')
    const checkInAlertDate = new Date(checkInDateObj)
    checkInAlertDate.setDate(checkInAlertDate.getDate() - 30)

    if (checkInAlertDate >= today) {
      alertsToCreate.push({
        operation_id: operationId,
        user_id: seller_id,
        type: "UPCOMING_TRIP",
        description: `✈️ Check-in próximo: ${destination} - ${checkin_date ? `Check-in ${checkin_date}` : `Salida ${departure_date}`}`,
        date_due: checkInAlertDate.toISOString().split("T")[0],
        status: "PENDING",
      })
    }
  }

  // 2. ALERTA DE CHECK-OUT (día antes del regreso o checkout_date si existe)
  const checkOutDate = checkout_date || return_date
  if (checkOutDate) {
    const checkOutDateObj = new Date(checkOutDate + 'T12:00:00')
    const checkOutAlertDate = new Date(checkOutDateObj)
    checkOutAlertDate.setDate(checkOutAlertDate.getDate() - 1)

    if (checkOutAlertDate >= today) {
      alertsToCreate.push({
        operation_id: operationId,
        user_id: seller_id,
        type: "UPCOMING_TRIP",
        description: `🏨 Check-out próximo: ${destination} - ${checkout_date ? `Check-out ${checkout_date}` : `Regreso ${return_date}`}`,
        date_due: checkOutAlertDate.toISOString().split("T")[0],
        status: "PENDING",
      })
    }
  }

  // 3. ALERTAS DE CUMPLEAÑOS DE CLIENTES (7 días antes del cumpleaños)
  const { data: operationCustomers } = await supabase
    .from("operation_customers")
    .select(`
      customer_id,
      customers:customer_id (
        id,
        first_name,
        last_name,
        date_of_birth
      )
    `)
    .eq("operation_id", operationId)

  const customers = (operationCustomers || []) as any[]
  for (const oc of customers) {
    const customer = oc.customers
    if (customer?.date_of_birth) {
      const birthDate = new Date(customer.date_of_birth + 'T12:00:00')
      const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())
      
      // Si ya pasó este año, usar el próximo
      if (thisYearBirthday < today) {
        thisYearBirthday.setFullYear(thisYearBirthday.getFullYear() + 1)
      }

      // Alerta 7 días antes del cumpleaños
      const birthdayAlertDate = new Date(thisYearBirthday)
      birthdayAlertDate.setDate(birthdayAlertDate.getDate() - 7)

      // Solo si es dentro de los próximos 60 días
      const sixtyDaysFromNow = new Date(today)
      sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60)

      if (birthdayAlertDate >= today && birthdayAlertDate <= sixtyDaysFromNow) {
        alertsToCreate.push({
          operation_id: operationId,
          customer_id: customer.id,
          user_id: seller_id,
          type: "GENERIC",
          description: `🎂 Cumpleaños próximo: ${customer.first_name} ${customer.last_name} - ${birthDate.getDate()}/${birthDate.getMonth() + 1}`,
          date_due: birthdayAlertDate.toISOString().split("T")[0],
          status: "PENDING",
        })
      }
    }
  }

  // Insertar alertas
  if (alertsToCreate.length > 0) {
    const { error: insertError } = await (supabase.from("alerts") as any).insert(alertsToCreate)
    if (insertError) {
      console.error("Error creando alertas de operación:", insertError)
    } else {
      console.log(`✅ Creadas ${alertsToCreate.length} alertas de check-in/check-out para operación ${operationId}`)
      
      // Generar mensajes de WhatsApp para las alertas creadas
      try {
        const messagesGenerated = await generateMessagesFromAlerts(supabase, alertsToCreate)
        if (messagesGenerated > 0) {
          console.log(`✅ Generados ${messagesGenerated} mensajes de WhatsApp para las alertas`)
        }
      } catch (error) {
        console.error("Error generando mensajes de WhatsApp:", error)
        // No lanzamos error para no romper la creación de alertas
      }
    }
  }
}
