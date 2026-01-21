/**
 * API Route: Migrar Datos Históricos Contables
 * 
 * Solo accesible para SUPER_ADMIN
 * Genera IVA y operator_payments para operaciones existentes que no los tienen
 */

import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createSaleIVA, createPurchaseIVA } from "@/lib/accounting/iva"
import { createOperatorPayment, calculateDueDate } from "@/lib/accounting/operator-payments"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Solo SUPER_ADMIN puede ejecutar esta migración
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "No tienes permiso para ejecutar esta migración" },
        { status: 403 }
      )
    }

    const supabase = await createServerClient()

    console.log("🔄 Iniciando migración de datos históricos contables...")

    // 1. Migrar IVA
    const { data: operationsWithoutIVA } = await supabase
      .from("operations")
      .select("id, sale_amount_total, operator_cost, sale_currency, operator_cost_currency, departure_date, operator_id, created_at")
      .not("sale_amount_total", "is", null)
      .gt("sale_amount_total", 0)

    let ivaCreated = 0
    let ivaErrors = 0

    for (const op of operationsWithoutIVA || []) {
      const operation = op as any
      try {
        // Verificar si ya existe IVA de venta
        const { data: existingSaleIVA } = await supabase
          .from("iva_sales")
          .select("id")
          .eq("operation_id", operation.id)
          .maybeSingle()

        // Verificar si ya existe IVA de compra
        const { data: existingPurchaseIVA } = await supabase
          .from("iva_purchases")
          .select("id")
          .eq("operation_id", operation.id)
          .maybeSingle()

        // Crear IVA de venta si no existe
        if (!existingSaleIVA && operation.sale_amount_total > 0) {
          await createSaleIVA(
            supabase,
            operation.id,
            operation.sale_amount_total,
            (operation.sale_currency || "ARS") as "ARS" | "USD",
            operation.departure_date || operation.created_at.split("T")[0]
          )
          ivaCreated++
        }

        // Crear IVA de compra si no existe y hay operator_id
        if (!existingPurchaseIVA && operation.operator_cost > 0 && operation.operator_id) {
          await createPurchaseIVA(
            supabase,
            operation.id,
            operation.operator_id,
            operation.operator_cost,
            (operation.operator_cost_currency || "ARS") as "ARS" | "USD",
            operation.departure_date || operation.created_at.split("T")[0]
          )
          ivaCreated++
        }
      } catch (error: any) {
        ivaErrors++
        console.error(`Error procesando operación ${operation.id}:`, error.message)
      }
    }

    // 2. Migrar operator_payments
    const { data: operationsWithoutPayments } = await supabase
      .from("operations")
      .select("id, operator_id, operator_cost, operator_cost_currency, product_type, departure_date, checkin_date, created_at")
      .not("operator_id", "is", null)
      .gt("operator_cost", 0)

    let paymentsCreated = 0
    let paymentsErrors = 0

    for (const op of operationsWithoutPayments || []) {
      const operation = op as any
      try {
        // Verificar si ya existe operator_payment
        const { data: existingPayment } = await supabase
          .from("operator_payments")
          .select("id")
          .eq("operation_id", operation.id)
          .maybeSingle()

        if (!existingPayment && operation.operator_id && operation.operator_cost > 0) {
          // Calcular fecha de vencimiento
          const dueDate = calculateDueDate(
            operation.product_type as any,
            operation.created_at.split("T")[0],
            operation.checkin_date || undefined,
            operation.departure_date || undefined
          )

          await createOperatorPayment(
            supabase,
            operation.operator_id,
            operation.operator_cost,
            (operation.operator_cost_currency || "ARS") as "ARS" | "USD",
            dueDate,
            operation.id, // operationId
            `Pago automático generado para operación ${operation.id.slice(0, 8)} (migración histórica)`
          )
          paymentsCreated++
        }
      } catch (error: any) {
        paymentsErrors++
        console.error(`Error procesando operación ${operation.id}:`, error.message)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        ivaCreated,
        ivaErrors,
        paymentsCreated,
        paymentsErrors,
      },
      message: `Migración completada: ${ivaCreated} registros de IVA y ${paymentsCreated} operator payments creados`,
    })
  } catch (error: any) {
    console.error("Error in POST /api/admin/migrate-historical-accounting:", error)
    return NextResponse.json(
      { error: error.message || "Error al ejecutar migración" },
      { status: 500 }
    )
  }
}

