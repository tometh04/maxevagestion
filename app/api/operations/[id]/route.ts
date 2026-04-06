import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { updateSaleIVA, updatePurchaseIVA, deleteSaleIVA, deletePurchaseIVA } from "@/lib/accounting/iva"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"
import { revalidateTag, CACHE_TAGS } from "@/lib/cache"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operationId } = await params

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
        )
      `)
      .eq("id", operationId)
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
    documentsResult,
    paymentsResult,
    alertsResult
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("operation_id", operationId)
      .order("uploaded_at", { ascending: false }),
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

  const documents = documentsResult.data || []
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

    // Get current operation to check permissions and compare values
    const { data: currentOperation } = await supabase
      .from("operations")
      .select("*")
      .eq("id", operationId)
      .single()

    if (!currentOperation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Type assertion for operation
    const currentOp = currentOperation as any

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

    // Detectar cambio de moneda
    const oldCurrency = currentOp.currency || currentOp.sale_currency || "USD"
    const newCurrency = body.currency || body.sale_currency || oldCurrency
    const currencyChanged = oldCurrency !== newCurrency

    // Extraer operators del body para no enviarlo a la tabla operations
    const { operators: incomingOperators, ...bodyWithoutOperators } = body

    // Calculate margin if amounts changed
    let updateData: any = { ...bodyWithoutOperators }

    // Si se actualiza currency pero no sale_currency, sincronizarlos para evitar inconsistencias
    // (el edit-operation-dialog solo tiene el campo "currency" en su formulario)
    if (body.currency && !body.sale_currency) {
      updateData.sale_currency = body.currency
    }

    const oldSaleAmount = currentOp.sale_amount_total
    const oldOperatorCost = currentOp.operator_cost
    const newSaleAmount = body.sale_amount_total ?? oldSaleAmount
    const newOperatorCost = body.operator_cost ?? oldOperatorCost

    if (body.sale_amount_total !== undefined || body.operator_cost !== undefined) {
      updateData.margin_amount = newSaleAmount - newOperatorCost
      updateData.margin_percentage = newSaleAmount > 0 ? (updateData.margin_amount / newSaleAmount) * 100 : 0
    }

    updateData.updated_at = new Date().toISOString()

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

    const op = operation as any
    const currency = op.currency || op.sale_currency || "USD"

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
    if (incomingOperators && Array.isArray(incomingOperators)) {
      try {
        // Eliminar operadores existentes
        await (supabase.from("operation_operators") as any)
          .delete()
          .eq("operation_id", operationId)

        // Insertar nuevos operadores
        if (incomingOperators.length > 0) {
          const operationOperatorsData = incomingOperators.map((opData: any) => ({
            operation_id: operationId,
            operator_id: opData.operator_id,
            cost: opData.cost || 0,
            cost_currency: opData.cost_currency || "USD",
            product_type: opData.product_type || null,
            notes: opData.notes || null,
          }))

          const { error: opOpError } = await (supabase.from("operation_operators") as any)
            .insert(operationOperatorsData)

          if (opOpError) {
            console.error("Error inserting operation operators:", opOpError)
          } else {
          }
        }
      } catch (error) {
        console.error("Error updating operation operators:", error)
      }
    }

    // ============================================
    // ACTUALIZAR IVA SI CAMBIARON LOS MONTOS
    // ============================================
    // Si cambió el monto de venta o el costo del operador, actualizar IVA de venta (calculado sobre ganancia)
    if ((body.sale_amount_total !== undefined && body.sale_amount_total !== oldSaleAmount) ||
        (body.operator_cost !== undefined && body.operator_cost !== oldOperatorCost)) {
      try {
        // Obtener monedas de la operación actualizada
        const saleCurrency = op.sale_currency || op.currency || "USD"
        const operatorCostCurrency = op.operator_cost_currency || op.currency || "USD"
        
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
    if (body.operator_cost !== undefined && body.operator_cost !== oldOperatorCost) {
      try {
        await updatePurchaseIVA(supabase, operationId, newOperatorCost, currency)
      } catch (error) {
        console.error("Error updating purchase IVA:", error)
      }
    }

    // ============================================
    // ACTUALIZAR OPERATOR_PAYMENT SI CAMBIÓ EL COSTO O LA MONEDA
    // ============================================
    const costChanged = body.operator_cost !== undefined && body.operator_cost !== oldOperatorCost
    if (costChanged || currencyChanged) {
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
    try {
      const { calculateCommission, createOrUpdateCommissionRecords } = await import("@/lib/commissions/calculate")
      const commissionData = await calculateCommission(op)

      if (commissionData.totalCommission > 0) {
        await createOrUpdateCommissionRecords(op, commissionData)
      }
    } catch (error) {
      console.error("Error calculating commission:", error)
    }

    // Invalidar caché del dashboard (los KPIs cambian al editar una operación)
    revalidateTag(CACHE_TAGS.DASHBOARD)

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

    // Get operation data before deletion
    const { data: operation } = await supabase
      .from("operations")
      .select("*, lead_id")
      .eq("id", operationId)
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
