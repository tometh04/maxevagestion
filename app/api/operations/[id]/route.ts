import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { updateSaleIVA, updatePurchaseIVA, deleteSaleIVA, deletePurchaseIVA } from "@/lib/accounting/iva"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operationId } = await params

    // Get operation with related data
    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .select(`
        *,
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name, contact_email, contact_phone),
        agencies:agency_id(id, name, city),
        leads:lead_id(id, contact_name, destination, status)
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

    // Get customers
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select(`
        *,
        customers:customer_id(*)
      `)
      .eq("operation_id", operationId)

    // Get documents
    const { data: documents } = await supabase
      .from("documents")
      .select("*")
      .eq("operation_id", operationId)
      .order("uploaded_at", { ascending: false })

    // Get payments
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("operation_id", operationId)
      .order("date_due", { ascending: true })

    // Get alerts
    const { data: alerts } = await supabase
      .from("alerts")
      .select("*")
      .eq("operation_id", operationId)
      .order("date_due", { ascending: true })

    return NextResponse.json({
      operation,
      customers: operationCustomers || [],
      documents: documents || [],
      payments: payments || [],
      alerts: alerts || [],
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

    // Calculate margin if amounts changed
    let updateData: any = { ...body }
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
    const currency = op.currency || "ARS"

    // ============================================
    // ACTUALIZAR IVA SI CAMBIARON LOS MONTOS
    // ============================================
    if (body.sale_amount_total !== undefined && body.sale_amount_total !== oldSaleAmount) {
      try {
        await updateSaleIVA(supabase, operationId, newSaleAmount, currency)
        console.log(`✅ IVA Ventas actualizado para operación ${operationId}: ${newSaleAmount}`)
      } catch (error) {
        console.error("Error updating sale IVA:", error)
      }
    }

    if (body.operator_cost !== undefined && body.operator_cost !== oldOperatorCost) {
      try {
        await updatePurchaseIVA(supabase, operationId, newOperatorCost, currency)
        console.log(`✅ IVA Compras actualizado para operación ${operationId}: ${newOperatorCost}`)
      } catch (error) {
        console.error("Error updating purchase IVA:", error)
      }
    }

    // ============================================
    // ACTUALIZAR OPERATOR_PAYMENT SI CAMBIÓ EL COSTO
    // ============================================
    if (body.operator_cost !== undefined && body.operator_cost !== oldOperatorCost) {
      try {
        // Buscar operator_payment pendiente
        const { data: operatorPayment } = await (supabase.from("operator_payments") as any)
          .select("id, status")
          .eq("operation_id", operationId)
          .eq("status", "PENDING")
          .maybeSingle()

        if (operatorPayment) {
          await (supabase.from("operator_payments") as any)
            .update({ 
              amount: newOperatorCost,
              currency: currency,
              updated_at: new Date().toISOString()
            })
            .eq("id", operatorPayment.id)
          console.log(`✅ Operator payment actualizado para operación ${operationId}: ${newOperatorCost}`)
        }
      } catch (error) {
        console.error("Error updating operator payment:", error)
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

    // Si el status cambió a CONFIRMED o CLOSED, calcular comisiones automáticamente
    if (body.status === "CONFIRMED" || body.status === "CLOSED") {
      try {
        const { calculateCommission, createOrUpdateCommissionRecords } = await import("@/lib/commissions/calculate")
        const commissionData = await calculateCommission(op)
        
        if (commissionData.totalCommission > 0) {
          await createOrUpdateCommissionRecords(op, commissionData)
          console.log(`✅ Comisión calculada para operación ${operationId}: $${commissionData.totalCommission}`)
        }
      } catch (error) {
        console.error("Error calculating commission:", error)
      }
    }

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

    console.log(`🗑️ Iniciando eliminación de operación ${operationId}...`)

    // 1. Eliminar registros de IVA
    try {
      await deleteSaleIVA(supabase, operationId)
      await deletePurchaseIVA(supabase, operationId)
      console.log(`  ✓ IVA eliminado`)
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
        for (const payment of payments as any[]) {
          // Eliminar cash_movement asociado
          await (supabase.from("cash_movements") as any)
            .delete()
            .eq("payment_id", payment.id)

          // Eliminar ledger_movement asociado
          if (payment.ledger_movement_id) {
            await (supabase.from("ledger_movements") as any)
              .delete()
              .eq("id", payment.ledger_movement_id)
          }
        }
        // Los pagos se eliminan por CASCADE, pero lo hacemos explícito
        await (supabase.from("payments") as any).delete().eq("operation_id", operationId)
        console.log(`  ✓ ${payments.length} pagos eliminados con sus movimientos`)
      }
    } catch (error) {
      console.error("Error deleting payments:", error)
    }

    // 3. Eliminar ledger_movements de la operación (los que no son de pagos)
    try {
      await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("operation_id", operationId)
      console.log(`  ✓ Ledger movements eliminados`)
    } catch (error) {
      console.error("Error deleting ledger movements:", error)
    }

    // 4. Eliminar cash_movements de la operación
    try {
      await (supabase.from("cash_movements") as any)
        .delete()
        .eq("operation_id", operationId)
      console.log(`  ✓ Cash movements eliminados`)
    } catch (error) {
      console.error("Error deleting cash movements:", error)
    }

    // 5. Eliminar operator_payments
    try {
      await (supabase.from("operator_payments") as any)
        .delete()
        .eq("operation_id", operationId)
      console.log(`  ✓ Operator payments eliminados`)
    } catch (error) {
      console.error("Error deleting operator payments:", error)
    }

    // 6. Eliminar alertas
    try {
      await supabase.from("alerts").delete().eq("operation_id", operationId)
      console.log(`  ✓ Alertas eliminadas`)
    } catch (error) {
      console.error("Error deleting alerts:", error)
    }

    // 7. Eliminar comisiones
    try {
      await (supabase.from("commissions") as any)
        .delete()
        .eq("operation_id", operationId)
      console.log(`  ✓ Comisiones eliminadas`)
    } catch (error) {
      console.error("Error deleting commissions:", error)
    }

    // 8. Eliminar documentos (el storage se limpia con policies)
    try {
      await supabase.from("documents").delete().eq("operation_id", operationId)
      console.log(`  ✓ Documentos eliminados`)
    } catch (error) {
      console.error("Error deleting documents:", error)
    }

    // 9. Si hay lead asociado, revertirlo a IN_PROGRESS
    if (op.lead_id) {
      try {
        await (supabase.from("leads") as any)
          .update({ status: "IN_PROGRESS" })
          .eq("id", op.lead_id)
        console.log(`  ✓ Lead ${op.lead_id} revertido a IN_PROGRESS`)
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

    console.log(`✅ Operación ${operationId} eliminada completamente`)

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
