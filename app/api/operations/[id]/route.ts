import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { updateSaleIVA, updatePurchaseIVA, deleteSaleIVA, deletePurchaseIVA, createPurchaseIVA } from "@/lib/accounting/iva"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"
import { revalidateTag, CACHE_TAGS } from "@/lib/cache"
import { createOperatorPayment, calculateDueDate } from "@/lib/accounting/operator-payments"
import { logAudit, getClientIP } from "@/lib/audit"
import { enforceUserRateLimit } from "@/lib/rate-limit"
import { getOperationVisibleDocuments } from "@/lib/documents/operation-documents"
import { sumOperationOperatorCosts } from "@/lib/operations/operation-financials"

type IncomingOperatorPayload = {
  operator_id: string
  cost: number
  cost_currency: "ARS" | "USD"
  product_type?: string | null
  notes?: string | null
}

function normalizeIncomingOperators(
  incomingOperators: any,
  fallbackCurrency: string
): IncomingOperatorPayload[] | null {
  if (!Array.isArray(incomingOperators)) {
    return null
  }

  return incomingOperators
    .filter((operatorData: any) => operatorData?.operator_id)
    .map((operatorData: any) => ({
      operator_id: String(operatorData.operator_id),
      cost: Number(operatorData.cost || 0),
      cost_currency: ((operatorData.cost_currency || fallbackCurrency || "USD").toUpperCase() === "ARS" ? "ARS" : "USD") as "ARS" | "USD",
      product_type: operatorData.product_type || null,
      notes: operatorData.notes || null,
    }))
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operationId } = await params

    // Cross-tenant fix (2026-05-18): exigir org_id y scopear el fetch para
    // que ADMIN/CONTABLE/SUPER_ADMIN de otra org no puedan leer la op por id.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Get operation with related data (INTEGRADO: clientes incluidos en la misma query)
    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .select(`
        *,
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name, contact_email, contact_phone),
        agencies:agency_id(id, name, city),
        leads:lead_id(id, contact_name, destination, status),
        operation_customers(
          *,
          customers:customer_id(*)
        ),
        operation_operators(
          *,
          operators:operator_id(id, name)
        ),
        operation_services(
          operator_id,
          operator_payment_id,
          operators:operator_id(id, name)
        ),
        operator_payments(
          id,
          operator_id,
          amount,
          paid_amount,
          status,
          operators:operator_id(id, name)
        ),
        iva_purchases(
          operator_id,
          operators:operator_id(id, name)
        )
      `)
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .single()

  if (operationError || !operation) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
  }

  // Type assertion for operation
  const op = operation as any

  // Check permissions
  const userRole = user.role as string
  if (userRole === "SELLER" && op.seller_id !== user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  // Extraer clientes de la operación (ya están incluidos en la query)
  const operationCustomers = (op.operation_customers || []) as any[]

  // OPTIMIZACIÓN: Paralelizar queries restantes (documentos, pagos, alertas)
  const [
    documents,
    paymentsResult,
    alertsResult
  ] = await Promise.all([
    getOperationVisibleDocuments(supabase, {
      operationId,
      leadId: op.lead_id,
      operationCustomers,
    }),
    supabase
      .from("payments")
      .select("*")
      .eq("operation_id", operationId)
      .order("date_due", { ascending: true }),
    supabase
      .from("alerts")
      .select("*")
      .eq("operation_id", operationId)
      .order("date_due", { ascending: true }),
  ])

  const payments = paymentsResult.data || []
  const alerts = alertsResult.data || []

  // Limpiar operation_customers del objeto operation para evitar duplicación
  const { operation_customers, ...operationWithoutCustomers } = op

  return NextResponse.json({
    operation: operationWithoutCustomers,
    customers: operationCustomers,
    documents: documents,
    payments: payments,
    alerts: alerts,
  })
  } catch (error) {
    console.error("Error in GET /api/operations/[id]:", error)
    return NextResponse.json({ error: "Error al obtener operación" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operationId } = await params
    const body = await request.json()

    // Cross-tenant fix (2026-05-18): exigir org_id y scopear el fetch para
    // bloquear PATCH desde otra org (defense-in-depth sobre RLS).
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Get current operation to check permissions and compare values
    const { data: currentOperation } = await supabase
      .from("operations")
      .select("*")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (!currentOperation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Type assertion for operation
    const currentOp = currentOperation as any

    const { data: existingOperationOperators } = await (supabase.from("operation_operators") as any)
      .select("operator_id, cost, cost_currency, product_type, notes")
      .eq("operation_id", operationId)

    // Check permissions
    const userRole = user.role as string
    if (userRole === "SELLER" && currentOp.seller_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Validaciones de fechas
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (body.operation_date) {
      const operationDate = new Date(body.operation_date)
      operationDate.setHours(0, 0, 0, 0)
      
      if (operationDate > today) {
        return NextResponse.json({ error: "La fecha de operación no puede ser futura" }, { status: 400 })
      }
    }

    if (body.departure_date) {
      const departureDate = new Date(body.departure_date)
      departureDate.setHours(0, 0, 0, 0)
      
      const operationDate = body.operation_date 
        ? new Date(body.operation_date) 
        : new Date(currentOp.operation_date)
      operationDate.setHours(0, 0, 0, 0)

      if (departureDate < operationDate) {
        return NextResponse.json({ error: "La fecha de salida debe ser posterior a la fecha de operación" }, { status: 400 })
      }
    }

    // Validaciones de montos
    if (body.sale_amount_total !== undefined && body.sale_amount_total < 0) {
      return NextResponse.json({ error: "El monto de venta no puede ser negativo" }, { status: 400 })
    }

    if (body.operator_cost !== undefined && body.operator_cost < 0) {
      return NextResponse.json({ error: "El costo de operador no puede ser negativo" }, { status: 400 })
    }

    // Validación overrides de comisión (29/04 — Tomi opción B):
    // Si vienen los dos absolutos y hay seller secondary efectivo (en el
    // body o en la op actual), validar suma ≤ comisión del principal.
    const effectiveSecondaryId =
      body.seller_secondary_id !== undefined ? body.seller_secondary_id : currentOp.seller_secondary_id
    if (
      effectiveSecondaryId &&
      body.commission_pct_primary != null &&
      body.commission_pct_secondary != null
    ) {
      const primaryPctNum = Number(body.commission_pct_primary)
      const secondaryPctNum = Number(body.commission_pct_secondary)

      if (Number.isNaN(primaryPctNum) || Number.isNaN(secondaryPctNum) || primaryPctNum < 0 || secondaryPctNum < 0) {
        return NextResponse.json(
          { error: "Las comisiones deben ser números no negativos" },
          { status: 400 }
        )
      }

      const effectivePrimaryId = body.seller_id ?? currentOp.seller_id
      const { getSellerPercentage } = await import("@/lib/commissions/calculate")
      const principalPct = await getSellerPercentage(effectivePrimaryId)
      const sumOverrides = primaryPctNum + secondaryPctNum

      if (sumOverrides > principalPct + 0.01) {
        return NextResponse.json(
          {
            error: `La suma de comisiones (${sumOverrides.toFixed(2)}%) no puede superar la comisión del vendedor principal (${principalPct.toFixed(2)}%)`,
          },
          { status: 400 }
        )
      }
    }

    // Detectar cambio de moneda
    const oldCurrency = currentOp.sale_currency || currentOp.currency || "USD"
    const newCurrency = body.currency || body.sale_currency || oldCurrency
    const currencyChanged = oldCurrency !== newCurrency

    // Bloquear cambio de moneda si la operación ya tiene movimientos contables
    // (fix A.2 auditoría): recalcular ledger_movements existentes en la nueva
    // moneda es complejo (requiere TC histórico por cada movimiento) y peligroso.
    // Preferimos fallar claro y pedir al usuario que elimine pagos primero.
    if (currencyChanged) {
      const { data: existingLedger } = await (supabase.from("ledger_movements") as any)
        .select("id")
        .eq("operation_id", operationId)
        .limit(1)

      if (existingLedger && existingLedger.length > 0) {
        return NextResponse.json(
          {
            error:
              `No se puede cambiar la moneda de esta operación porque ya tiene pagos/movimientos contables registrados en ${oldCurrency}. ` +
              "Para cambiarla, primero elimine los pagos existentes o contacte al equipo contable.",
          },
          { status: 400 }
        )
      }
    }

    // Extraer operators y legs del body para no enviarlos a la tabla operations
    const { operators: incomingOperators, legs: incomingLegs, ...bodyWithoutOperators } = body
    const normalizedIncomingOperators = normalizeIncomingOperators(
      incomingOperators,
      currentOp.operator_cost_currency || currentOp.sale_currency || currentOp.currency || "USD"
    )
    const synchronizedOperators = normalizedIncomingOperators || []
    const usesIncomingOperators = Array.isArray(normalizedIncomingOperators)
    const existingOperatorRows = (existingOperationOperators || []) as Array<{
      operator_id?: string | null
      cost?: number | string | null
      cost_currency?: string | null
    }>
    const totalIncomingOperatorCost = usesIncomingOperators
      ? synchronizedOperators.reduce((sum, operatorData) => sum + Number(operatorData.cost || 0), 0)
      : null
    const primaryIncomingOperator = usesIncomingOperators && synchronizedOperators.length > 0
      ? synchronizedOperators[0]
      : null
    const auditWarnings: string[] = []

    if (usesIncomingOperators) {
      const hasInvalidOperatorCost = synchronizedOperators.some((operatorData) => Number.isNaN(operatorData.cost) || operatorData.cost < 0)
      if (hasInvalidOperatorCost) {
        return NextResponse.json({ error: "El costo de operador no puede ser negativo" }, { status: 400 })
      }
    }

    // Calculate margin if amounts changed
    let updateData: any = { ...bodyWithoutOperators }

    if (usesIncomingOperators) {
      updateData.operator_id = primaryIncomingOperator?.operator_id || null
      updateData.operator_cost = totalIncomingOperatorCost || 0
      if (primaryIncomingOperator?.cost_currency) {
        updateData.operator_cost_currency = primaryIncomingOperator.cost_currency
      }
    } else if (existingOperatorRows.length > 0) {
      // En operaciones con tabla de operadores, el costo agregado es derivado.
      // Evita que una edición de venta re-guarde un costo viejo del formulario.
      updateData.operator_id = existingOperatorRows[0]?.operator_id || currentOp.operator_id || null
      updateData.operator_cost = sumOperationOperatorCosts(existingOperatorRows)
      updateData.operator_cost_currency =
        existingOperatorRows[0]?.cost_currency ||
        currentOp.operator_cost_currency ||
        currentOp.sale_currency ||
        currentOp.currency ||
        "USD"
    }

    // Si se actualiza currency pero no sale_currency, sincronizarlos para evitar inconsistencias
    // (el edit-operation-dialog solo tiene el campo "currency" en su formulario)
    if (body.currency && !body.sale_currency) {
      updateData.sale_currency = body.currency
    }

    // Bug fix 2026-05-15 (reportado por Santi #6f18a299):
    // Hay 2 modelos coexistiendo para comisiones compartidas:
    //   - LEGACY: operations.commission_split (un solo número 0-100 = % del principal)
    //   - NUEVO: operations.commission_pct_primary + commission_pct_secondary (% absolutos)
    // El edit dialog tiene inputs SOLO para los nuevos. El display de la UI
    // lee SOLO el legacy. → editar los nuevos no impactaba el display.
    //
    // Fix: cuando el PATCH recibe los pct_primary/secondary, derivar el
    // commission_split proporcional y guardarlo también. Mantiene legacy sync.
    if (
      updateData.commission_pct_primary != null &&
      updateData.commission_pct_secondary != null
    ) {
      const p = Number(updateData.commission_pct_primary)
      const s = Number(updateData.commission_pct_secondary)
      const total = p + s
      if (Number.isFinite(total) && total > 0) {
        // commission_split = % de la comisión total que va al principal
        updateData.commission_split = Math.round((p / total) * 100 * 100) / 100
      }
    }

    const oldSaleAmount = currentOp.sale_amount_total
    const oldOperatorCost = currentOp.operator_cost
    const newSaleAmount = updateData.sale_amount_total ?? oldSaleAmount
    const newOperatorCost = updateData.operator_cost ?? oldOperatorCost
    const saleChanged = newSaleAmount !== oldSaleAmount
    const costChanged = newOperatorCost !== oldOperatorCost

    if (saleChanged || costChanged) {
      updateData.margin_amount = newSaleAmount - newOperatorCost
      updateData.margin_percentage = newSaleAmount > 0 ? (updateData.margin_amount / newSaleAmount) * 100 : 0
    }

    updateData.updated_at = new Date().toISOString()

    let operatorRowsReplaced = false
    if (usesIncomingOperators) {
      const operatorsPayload = synchronizedOperators.map((operatorData) => ({
        operator_id: operatorData.operator_id,
        cost: operatorData.cost || 0,
        cost_currency: operatorData.cost_currency || "USD",
        product_type: operatorData.product_type || null,
        notes: operatorData.notes || null,
      }))

      const { error: rpcError } = await (supabase.rpc as any)("replace_operation_operators", {
        p_operation_id: operationId,
        p_operators: operatorsPayload,
      })

      if (rpcError) {
        console.error("Error en RPC replace_operation_operators:", rpcError)
        return NextResponse.json(
          { error: "No se pudo sincronizar los operadores de la operación. No se guardaron los cambios." },
          { status: 500 }
        )
      }

      operatorRowsReplaced = true
    }

    // Update operation
    const { data: operation, error: updateError } = await (supabase.from("operations") as any)
      .update(updateData)
      .eq("id", operationId)
      .select()
      .single()

    if (updateError || !operation) {
      console.error("Error updating operation:", updateError)
      return NextResponse.json({ error: "Error al actualizar operación" }, { status: 400 })
    }

    // ============================================
    // SINCRONIZAR TRAMOS DEL VIAJE (operation_legs)
    // ============================================
    if (Array.isArray(incomingLegs)) {
      try {
        await (supabase.from("operation_legs") as any)
          .delete()
          .eq("operation_id", operationId)

        if (incomingLegs.length > 0) {
          const legsToInsert = incomingLegs.map((leg: any, i: number) => ({
            operation_id: operationId,
            agency_id: currentOp.agency_id,
            order_index: i,
            destination: leg.destination,
            departure_date: leg.departure_date || null,
            reservation_code_air: leg.reservation_code_air || null,
            airline_name: leg.airline_name || null,
            itr_localizador: leg.itr_localizador || null,
            hotel_name: leg.hotel_name || null,
            reservation_code_hotel: leg.reservation_code_hotel || null,
            checkin_date: leg.checkin_date || null,
            checkout_date: leg.checkout_date || null,
          }))
          const { error: legsError } = await (supabase.from("operation_legs") as any)
            .insert(legsToInsert)
          if (legsError) {
            console.error("Error guardando tramos:", legsError)
            auditWarnings.push("No se pudieron guardar los tramos del viaje")
          }
        }
      } catch (error) {
        console.error("Error sincronizando operation_legs:", error)
        auditWarnings.push("Fallo inesperado sincronizando tramos del viaje")
      }
    }

    const op = operation as any
    const currency = op.sale_currency || op.currency || "USD"

    // ============================================
    // MANEJAR CAMBIO DE MONEDA
    // ============================================
    if (currencyChanged) {
      try {
        // TODO: En el futuro, implementar recálculo automático de movimientos contables
        // cuando cambia la moneda de una operación
      } catch (error) {
        console.error("Error handling currency change:", error)
      }
    }

    // ============================================
    // ACTUALIZAR OPERATION_OPERATORS SI SE ENVIARON
    // ============================================
    if (usesIncomingOperators && !operatorRowsReplaced) {
      try {
        // Llamada atómica: DELETE + INSERT en una transacción SQL.
        // Si falla el insert, rollback automático → no perdemos los operadores viejos.
        // (Fix A.4 de la auditoría: evita dejar la operación sin operadores.)
        const operatorsPayload = synchronizedOperators.map((operatorData) => ({
          operator_id: operatorData.operator_id,
          cost: operatorData.cost || 0,
          cost_currency: operatorData.cost_currency || "USD",
          product_type: operatorData.product_type || null,
          notes: operatorData.notes || null,
        }))

        const { error: rpcError } = await (supabase.rpc as any)("replace_operation_operators", {
          p_operation_id: operationId,
          p_operators: operatorsPayload,
        })

        if (rpcError) {
          console.error("Error en RPC replace_operation_operators:", rpcError)
          auditWarnings.push(
            "No se pudo sincronizar operation_operators (rollback aplicado, operadores anteriores intactos)"
          )
        }
      } catch (error) {
        console.error("Error updating operation operators:", error)
        auditWarnings.push("Fallo inesperado sincronizando operation_operators")
      }
    }

    const operatorArtifactsChanged = usesIncomingOperators
    const { data: purchaseInvoices } = operatorArtifactsChanged
      ? await (supabase.from("purchase_invoices") as any)
          .select("id")
          .eq("operation_id", operationId)
          .limit(1)
      : { data: [] }
    const { data: existingOperatorPayments } = operatorArtifactsChanged
      ? await (supabase.from("operator_payments") as any)
          .select("id, status, paid_amount")
          .eq("operation_id", operationId)
      : { data: [] }

    // ============================================
    // ACTUALIZAR IVA SI CAMBIARON LOS MONTOS
    // ============================================
    // Si cambió el monto de venta o el costo del operador, actualizar IVA de venta (calculado sobre ganancia)
    if (saleChanged || costChanged) {
      try {
        // Obtener monedas de la operación actualizada
        const saleCurrency = op.sale_currency || op.currency || "USD"
        const operatorCostCurrency = op.operator_cost_currency || op.sale_currency || op.currency || "USD"
        
        // Convertir costo del operador a la misma moneda de venta si es necesario
        let operatorCostForIVA = newOperatorCost
        if (operatorCostCurrency !== saleCurrency && newOperatorCost > 0) {
          try {
            const { getExchangeRate } = await import("@/lib/accounting/exchange-rates")
            const exchangeRate = await getExchangeRate(supabase, op.departure_date || op.created_at)
            if (exchangeRate) {
              if (operatorCostCurrency === "USD" && saleCurrency === "ARS") {
                operatorCostForIVA = newOperatorCost * exchangeRate
              } else if (operatorCostCurrency === "ARS" && saleCurrency === "USD") {
                operatorCostForIVA = newOperatorCost / exchangeRate
              }
            }
          } catch (error) {
            console.error("Error convirtiendo moneda para IVA en actualización:", error)
          }
        }
        
        await updateSaleIVA(supabase, operationId, newSaleAmount, saleCurrency, operatorCostForIVA)
        const ganancia = newSaleAmount - operatorCostForIVA
      } catch (error) {
        console.error("Error updating sale IVA:", error)
      }
    }

    // IVA de compra se calcula sobre el costo del operador (sin cambios)
    if (operatorArtifactsChanged) {
      try {
        if ((purchaseInvoices || []).length > 0) {
          auditWarnings.push("Se conservaron iva_purchases existentes porque la operación tiene purchase_invoices")
        } else {
          await deletePurchaseIVA(supabase, operationId)

          for (const operatorData of synchronizedOperators) {
            if (operatorData.cost > 0) {
              await createPurchaseIVA(
                supabase,
                operationId,
                operatorData.operator_id,
                operatorData.cost,
                operatorData.cost_currency,
                op.departure_date || currentOp.departure_date || new Date().toISOString().split("T")[0]
              )
            }
          }
        }
      } catch (error) {
        console.error("Error updating purchase IVA:", error)
        auditWarnings.push("No se pudo sincronizar iva_purchases")
      }
    } else if (costChanged) {
      try {
        const { data: existingPurchaseIvaRows } = await (supabase.from("iva_purchases") as any)
          .select("id")
          .eq("operation_id", operationId)

        if ((existingPurchaseIvaRows || []).length <= 1) {
          await updatePurchaseIVA(supabase, operationId, newOperatorCost, currency)
        } else {
          auditWarnings.push("Se omitió updatePurchaseIVA porque la operación tiene múltiples iva_purchases")
        }
      } catch (error) {
        console.error("Error updating purchase IVA:", error)
        auditWarnings.push("No se pudo actualizar iva_purchases")
      }
    }

    // ============================================
    // ACTUALIZAR OPERATOR_PAYMENT SI CAMBIÓ EL COSTO O LA MONEDA
    // ============================================
    if (operatorArtifactsChanged) {
      try {
        const hasPaidOperatorPayments = (existingOperatorPayments || []).some((payment: any) => {
          const paidAmount = Number(payment.paid_amount || 0)
          return payment.status === "PAID" || paidAmount > 0
        })

        if (hasPaidOperatorPayments) {
          auditWarnings.push("Se conservaron operator_payments existentes porque hay pagos aplicados")
        } else {
          await (supabase.from("operator_payments") as any)
            .delete()
            .eq("operation_id", operationId)

          for (const operatorData of synchronizedOperators) {
            if (operatorData.cost > 0) {
              const dueDate = calculateDueDate(
                (operatorData.product_type || op.product_type || currentOp.product_type || null) as any,
                op.operation_date || currentOp.operation_date || op.created_at?.split("T")[0],
                op.checkin_date || currentOp.checkin_date || undefined,
                op.departure_date || currentOp.departure_date || undefined
              )

              await createOperatorPayment(
                supabase,
                operatorData.operator_id,
                operatorData.cost,
                operatorData.cost_currency,
                dueDate,
                operationId,
                `Pago automático actualizado para operación ${op.file_code || operationId.slice(0, 8)}`
              )
            }
          }
        }
      } catch (error) {
        console.error("Error syncing operator payments:", error)
        auditWarnings.push("No se pudieron sincronizar operator_payments")
      }
    } else if (costChanged || currencyChanged) {
      try {
        // Buscar operator_payments pendientes
        const { data: operatorPayments } = await (supabase.from("operator_payments") as any)
          .select("id, status")
          .eq("operation_id", operationId)
          .in("status", ["PENDING", "OVERDUE"])

        if (operatorPayments && operatorPayments.length > 0) {
          const operatorCostCurrency = op.operator_cost_currency || currency
          for (const payment of operatorPayments) {
            const updateFields: any = {
              currency: operatorCostCurrency,
              updated_at: new Date().toISOString()
            }
            // Solo actualizar monto si cambió el costo (y es un solo pago)
            if (costChanged && operatorPayments.length === 1) {
              updateFields.amount = newOperatorCost
            }
            await (supabase.from("operator_payments") as any)
              .update(updateFields)
              .eq("id", payment.id)
          }
        }
      } catch (error) {
        console.error("Error updating operator payment:", error)
      }
    }

    // ============================================
    // REASIGNAR OPERATOR_PAYMENTS SI CAMBIÓ EL OPERADOR
    // ============================================
    const oldOperatorId = currentOp.operator_id
    const newOperatorId = body.operator_id
    if (newOperatorId && newOperatorId !== oldOperatorId) {
      try {
        // Reasignar todos los operator_payments pendientes al nuevo operador
        const { data: reassigned, error: reassignError } = await (supabase.from("operator_payments") as any)
          .update({
            operator_id: newOperatorId,
            updated_at: new Date().toISOString()
          })
          .eq("operation_id", operationId)
          .eq("operator_id", oldOperatorId)
          .in("status", ["PENDING", "OVERDUE"])
          .select("id")

        if (reassignError) {
          console.error("Error reasignando operator_payments:", reassignError)
        } else {
          const count = reassigned?.length || 0
          if (count > 0) {
          }
        }
      } catch (error) {
        console.error("Error reassigning operator payments:", error)
      }
    }

    // Si el status cambió a CONFIRMED o RESERVED, generar alerta de documentación faltante
    if (body.status === "CONFIRMED" || body.status === "RESERVED" || op.status === "CONFIRMED" || op.status === "RESERVED") {
      try {
        const { generateMissingDocsAlert } = await import("@/lib/alerts/accounting-alerts")
        await generateMissingDocsAlert(supabase, op.agency_id, operationId, op.seller_id)
      } catch (error) {
        console.error("Error generating missing docs alert:", error)
      }
    }

    // Calcular comisiones automáticamente en cada update (si tiene vendedor y margen)
    let commissionData: { totalCommission: number; percentage: number; primaryCommission: number; secondaryCommission: number | null } | null = null
    try {
      const { calculateCommission, createOrUpdateCommissionRecords } = await import("@/lib/commissions/calculate")
      commissionData = await calculateCommission(op)

      if (commissionData.totalCommission > 0) {
        await createOrUpdateCommissionRecords(op, commissionData)
      }
    } catch (error) {
      console.error("Error calculating commission:", error)
    }

    // ============================================
    // ASIENTOS CONTABLES AUTOMÁTICOS (al confirmar)
    // ============================================
    const isNewConfirmation =
      (body.status === "CONFIRMED" || body.status === "CLOSED") &&
      currentOp.status !== "CONFIRMED" &&
      currentOp.status !== "CLOSED"

    if (isNewConfirmation) {
      try {
        const {
          createSaleJournalEntry,
          createCostJournalEntry,
          createCommissionJournalEntry,
        } = await import("@/lib/accounting/journal-entries")

        // Asiento 1: Venta (Ds x Ventas / Ventas)
        await createSaleJournalEntry(op, supabase)

        // Asiento 2: Costo (Costo Venta / Operadores a pagar)
        const { data: opOperators } = await (supabase.from("operation_operators") as any)
          .select("operator_id, cost, cost_currency, product_type, operators:operator_id(id, name)")
          .eq("operation_id", operationId)

        await createCostJournalEntry(op, opOperators || [], supabase)

        // Asiento 4: Comisiones (Com x Ventas / Com vendedores a pagar)
        if (commissionData && commissionData.totalCommission > 0) {
          await createCommissionJournalEntry(op, commissionData, supabase)
        }
      } catch (error) {
        console.error("Error creating journal entries on confirmation:", error)
        // No romper el flujo principal
      }
    }

    // Invalidar caché del dashboard (los KPIs cambian al editar una operación)
    revalidateTag(CACHE_TAGS.DASHBOARD)

    logAudit(supabase, {
      user_id: user.id,
      user_email: user.email,
      action: "UPDATE",
      entity_type: "operation",
      entity_id: operationId,
      details: {
        changed_fields: {
          sale_amount_total: saleChanged ? { from: oldSaleAmount, to: newSaleAmount } : null,
          operator_cost: costChanged ? { from: oldOperatorCost, to: newOperatorCost } : null,
          operator_id: updateData.operator_id !== undefined && updateData.operator_id !== currentOp.operator_id
            ? { from: currentOp.operator_id, to: updateData.operator_id }
            : null,
          currency: currencyChanged ? { from: oldCurrency, to: newCurrency } : null,
        },
        multi_operator_sync: usesIncomingOperators
          ? synchronizedOperators.map((operatorData) => ({
              operator_id: operatorData.operator_id,
              cost: operatorData.cost,
              cost_currency: operatorData.cost_currency,
            }))
          : null,
        warnings: auditWarnings,
      },
      ip_address: getClientIP(request) || undefined,
    })

    return NextResponse.json({ success: true, operation })
  } catch (error) {
    console.error("Error in PATCH /api/operations/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar operación" }, { status: 500 })
  }
}

/**
 * DELETE /api/operations/[id]
 * Eliminar una operación y todos sus datos relacionados
 * IMPORTANTE: Esta acción es irreversible
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operationId } = await params

    // Verificar permisos (solo ADMIN y SUPER_ADMIN pueden eliminar)
    const userRole = user.role as string
    if (!["ADMIN", "SUPER_ADMIN"].includes(userRole)) {
      return NextResponse.json({ error: "Solo administradores pueden eliminar operaciones" }, { status: 403 })
    }

    // Rate limit: DELETE operation es altamente destructivo (cascadea a
    // pagos, ledger, IVA, operator_payments, comisiones, etc.)
    const rateLimitBlock = enforceUserRateLimit(user.id, "/api/operations/[id]:DELETE", "WRITE")
    if (rateLimitBlock) return rateLimitBlock

    // Cross-tenant fix (2026-05-18): exigir org_id y scopear el fetch.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Get operation data before deletion
    const { data: operation } = await supabase
      .from("operations")
      .select("*, lead_id")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (!operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const op = operation as any


    // GUARD: Verificar si hay pagos PAID — no se puede eliminar una operación con pagos ya realizados
    const { data: paidPayments } = await (supabase
      .from("payments")
      .select("id, amount, currency, direction")
      .eq("operation_id", operationId)
      .eq("status", "PAID") as any)

    if (paidPayments && paidPayments.length > 0) {
      const paidSummary = (paidPayments as any[])
        .map((p: any) => `${p.currency} ${p.amount} (${p.direction})`)
        .join(", ")
      console.warn(`⛔ No se puede eliminar operación ${operationId}: tiene ${paidPayments.length} pagos PAID: ${paidSummary}`)
      return NextResponse.json({
        error: `No se puede eliminar esta operación porque tiene ${paidPayments.length} pago(s) ya realizados. Primero debe revertir los pagos.`,
        paid_payments: paidPayments.length
      }, { status: 400 })
    }

    // 1. Eliminar registros de IVA
    try {
      await deleteSaleIVA(supabase, operationId)
      await deletePurchaseIVA(supabase, operationId)
    } catch (error) {
      console.error("Error deleting IVA:", error)
    }

    // 2. Eliminar pagos y sus movimientos contables
    try {
      const { data: payments } = await (supabase
        .from("payments")
        .select("id, ledger_movement_id")
        .eq("operation_id", operationId) as any)

      if (payments && payments.length > 0) {
        // Recopilar account_ids de movimientos a eliminar para invalidar cache
        const paymentMovementIds = (payments as any[])
          .map((p: any) => p.ledger_movement_id)
          .filter(Boolean)

        let paymentAccountIds = new Set<string>()
        if (paymentMovementIds.length > 0) {
          const { data: paymentMovements } = await (supabase.from("ledger_movements") as any)
            .select("account_id")
            .in("id", paymentMovementIds)
          if (paymentMovements) {
            paymentAccountIds = new Set(paymentMovements.map((m: any) => m.account_id).filter(Boolean))
          }
        }

        for (const payment of payments as any[]) {
          await (supabase.from("cash_movements") as any)
            .delete()
            .eq("payment_id", payment.id)

          if (payment.ledger_movement_id) {
            await (supabase.from("ledger_movements") as any)
              .delete()
              .eq("id", payment.ledger_movement_id)
          }
        }
        // Los pagos se eliminan por CASCADE, pero lo hacemos explícito
        await (supabase.from("payments") as any).delete().eq("operation_id", operationId)

        // Invalidar cache de balances para cuentas afectadas
        Array.from(paymentAccountIds).forEach((accountId) => invalidateBalanceCache(accountId as string))
      }
    } catch (error) {
      console.error("Error deleting payments:", error)
    }

    // 3. Eliminar ledger_movements de la operación (los que no son de pagos)
    try {
      // Obtener account_ids antes de eliminar para invalidar cache
      const { data: movementsToDelete } = await (supabase.from("ledger_movements") as any)
        .select("account_id")
        .eq("operation_id", operationId)

      await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("operation_id", operationId)

      // Invalidar cache de balances para todas las cuentas afectadas
      if (movementsToDelete) {
        const accountIds = Array.from(new Set(movementsToDelete.map((m: any) => m.account_id).filter(Boolean))) as string[]
        accountIds.forEach((accountId) => invalidateBalanceCache(accountId))
      }
    } catch (error) {
      console.error("Error deleting ledger movements:", error)
    }

    // 4. Eliminar cash_movements de la operación
    try {
      await (supabase.from("cash_movements") as any)
        .delete()
        .eq("operation_id", operationId)
    } catch (error) {
      console.error("Error deleting cash movements:", error)
    }

    // 5. Eliminar operator_payments
    try {
      await (supabase.from("operator_payments") as any)
        .delete()
        .eq("operation_id", operationId)
    } catch (error) {
      console.error("Error deleting operator payments:", error)
    }

    // 6. Eliminar alertas
    try {
      await supabase.from("alerts").delete().eq("operation_id", operationId)
    } catch (error) {
      console.error("Error deleting alerts:", error)
    }

    // 7. Eliminar comisiones (commission_records)
    try {
      await (supabase.from("commission_records") as any)
        .delete()
        .eq("operation_id", operationId)
    } catch (error) {
      console.error("Error deleting commission_records:", error)
    }

    // 8. Eliminar documentos (el storage se limpia con policies)
    try {
      await supabase.from("documents").delete().eq("operation_id", operationId)
    } catch (error) {
      console.error("Error deleting documents:", error)
    }

    // 9. Si hay lead asociado, revertirlo a IN_PROGRESS
    if (op.lead_id) {
      try {
        await (supabase.from("leads") as any)
          .update({ status: "IN_PROGRESS" })
          .eq("id", op.lead_id)
      } catch (error) {
        console.error("Error reverting lead:", error)
      }
    }

    // 10. Finalmente eliminar la operación (esto cascadea operation_customers)
    const { error: deleteError } = await supabase
      .from("operations")
      .delete()
      .eq("id", operationId)

    if (deleteError) {
      console.error("Error deleting operation:", deleteError)
      return NextResponse.json({ error: "Error al eliminar operación" }, { status: 500 })
    }


    // Invalidar caché del dashboard (los KPIs cambian al eliminar una operación)
    revalidateTag(CACHE_TAGS.DASHBOARD)

    // Registrar en audit trail
    try {
      await (supabase.rpc as any)('log_audit_action', {
        p_user_id: user.id,
        p_action: 'OPERATION_DELETED',
        p_entity_type: 'operation',
        p_entity_id: operationId,
        p_details: {
          operation_number: op.operation_number,
          status: op.status,
          operator_id: op.operator_id,
          lead_id: op.lead_id,
          sale_amount_total: op.sale_amount_total,
          currency: op.currency
        }
      })
    } catch (auditError) {
      console.warn('Error logging audit action:', auditError)
    }

    return NextResponse.json({
      success: true,
      message: "Operación eliminada correctamente",
      leadReverted: op.lead_id ? true : false
    })
  } catch (error) {
    console.error("Error in DELETE /api/operations/[id]:", error)
    return NextResponse.json({ error: "Error al eliminar operación" }, { status: 500 })
  }
}
