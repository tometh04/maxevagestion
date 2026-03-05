import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { createLedgerMovement, calculateARSEquivalent } from "@/lib/accounting/ledger"
import { createOperatorPayment } from "@/lib/accounting/operator-payments"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

// Tipos de servicios que generan comisión al vendedor
const COMMISSION_SERVICE_TYPES = new Set(["TRANSFER", "ASSISTANCE"])

// Labels para conceptos contables
const SERVICE_TYPE_LABELS: Record<string, string> = {
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visa",
  TRANSFER: "Transfer",
  ASSISTANCE: "Asistencia",
}

// ─────────────────────────────────────────────
// GET: Listar servicios de una operación
// ─────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params
    const supabase = await createServerClient()

    // Verificar que la operación existe y el usuario tiene acceso
    const { data: operation, error: opError } = await (supabase.from("operations") as any)
      .select("id, agency_id, seller_id, file_code, departure_date")
      .eq("id", operationId)
      .single()

    if (opError || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // SELLER solo puede ver sus propias operaciones
    if (user.role === "SELLER" && operation.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso a esta operación" }, { status: 403 })
    }

    const { data: services, error } = await (supabase.from("operation_services") as any)
      .select(`
        *,
        operators:operator_id(id, name)
      `)
      .eq("operation_id", operationId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[Services GET] Error:", error)
      return NextResponse.json({ error: "Error al obtener servicios" }, { status: 500 })
    }

    return NextResponse.json({ services: services || [] })
  } catch (error: any) {
    console.error("[Services GET] Error inesperado:", error)
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// POST: Agregar un servicio a una operación
// ─────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para agregar servicios" }, { status: 403 })
    }

    const { id: operationId } = await params
    const supabase = await createServerClient()

    // Verificar que la operación existe y el usuario tiene acceso
    const { data: operation, error: opError } = await (supabase.from("operations") as any)
      .select("id, agency_id, seller_id, file_code, departure_date, status")
      .eq("id", operationId)
      .single()

    if (opError || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    if (user.role === "SELLER" && operation.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso a esta operación" }, { status: 403 })
    }

    if (operation.status === "CANCELLED") {
      return NextResponse.json({ error: "No se pueden agregar servicios a una operación cancelada" }, { status: 400 })
    }

    const body = await request.json()
    const {
      service_type,
      operator_id,
      sale_amount,
      sale_currency,
      cost_amount,
      cost_currency,
      description,
    } = body

    // Validaciones básicas
    if (!service_type) {
      return NextResponse.json({ error: "El tipo de servicio es requerido" }, { status: 400 })
    }

    const validTypes = ["SEAT", "LUGGAGE", "VISA", "TRANSFER", "ASSISTANCE"]
    if (!validTypes.includes(service_type)) {
      return NextResponse.json({ error: "Tipo de servicio inválido" }, { status: 400 })
    }

    if (sale_amount === undefined || sale_amount === null || Number(sale_amount) < 0) {
      return NextResponse.json({ error: "El precio de venta debe ser mayor o igual a 0" }, { status: 400 })
    }

    if (cost_amount === undefined || cost_amount === null || Number(cost_amount) < 0) {
      return NextResponse.json({ error: "El costo debe ser mayor o igual a 0" }, { status: 400 })
    }

    if (!["ARS", "USD"].includes(sale_currency)) {
      return NextResponse.json({ error: "La moneda de venta es inválida" }, { status: 400 })
    }

    if (!["ARS", "USD"].includes(cost_currency)) {
      return NextResponse.json({ error: "La moneda de costo es inválida" }, { status: 400 })
    }

    const saleAmount = Number(sale_amount)
    const costAmount = Number(cost_amount)
    const generatesCommission = COMMISSION_SERVICE_TYPES.has(service_type)
    const serviceLabel = SERVICE_TYPE_LABELS[service_type] || service_type
    const fileCode = operation.file_code || operationId.slice(0, 8)
    const departureDate = operation.departure_date

    // ── 1. Crear el registro del servicio ──────────────────
    const { data: service, error: serviceError } = await (supabase.from("operation_services") as any)
      .insert({
        operation_id: operationId,
        agency_id: operation.agency_id,
        service_type,
        description: description || null,
        operator_id: operator_id || null,
        sale_amount: saleAmount,
        sale_currency,
        cost_amount: costAmount,
        cost_currency,
        generates_commission: generatesCommission,
      })
      .select()
      .single()

    if (serviceError || !service) {
      console.error("[Services POST] Error creando servicio:", serviceError)
      return NextResponse.json({
        error: "Error al crear el servicio",
        details: serviceError?.message,
        code: serviceError?.code,
        hint: serviceError?.hint,
      }, { status: 500 })
    }

    const serviceId = service.id
    const updates: Record<string, string> = {}

    // ── 2. Deuda del cliente → payments (INCOME, PENDING) ──
    if (saleAmount > 0) {
      try {
        const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
          .insert({
            operation_id: operationId,
            payer_type: "CUSTOMER",
            direction: "INCOME",
            method: "OTHER",
            amount: saleAmount,
            currency: sale_currency,
            date_due: departureDate,
            status: "PENDING",
            reference: `Servicio: ${serviceLabel} - Op. ${fileCode}`,
          })
          .select("id")
          .single()

        if (!paymentError && payment) {
          updates.payment_id = payment.id
        } else {
          console.error("[Services POST] Error creando payment:", paymentError)
        }
      } catch (error) {
        console.error("[Services POST] Error en payment:", error)
      }
    }

    // ── 3. Deuda nuestra al operador → operator_payments ──
    if (costAmount > 0 && operator_id) {
      try {
        const opPayment = await createOperatorPayment(
          supabase,
          operator_id,
          costAmount,
          cost_currency as "ARS" | "USD",
          departureDate || new Date().toISOString().split("T")[0],
          operationId,
          `Servicio: ${serviceLabel} - Op. ${fileCode}`
        )
        if (opPayment?.id) {
          updates.operator_payment_id = opPayment.id
        }
      } catch (error) {
        console.error("[Services POST] Error en operator_payment:", error)
      }
    }

    // ── 4. Ledger: INCOME en Cuentas por Cobrar ────────────
    if (saleAmount > 0) {
      try {
        const { data: arChart } = await (supabase.from("chart_of_accounts") as any)
          .select("id")
          .eq("account_code", "1.1.03")
          .eq("is_active", true)
          .maybeSingle()

        if (arChart) {
          // Buscar o crear financial_account para Cuentas por Cobrar
          let { data: arAccount } = await (supabase.from("financial_accounts") as any)
            .select("id")
            .eq("chart_account_id", arChart.id)
            .eq("is_active", true)
            .maybeSingle()

          if (!arAccount) {
            const { data: newAR } = await (supabase.from("financial_accounts") as any)
              .insert({
                name: "Cuentas por Cobrar",
                type: "ASSETS",
                currency: sale_currency,
                chart_account_id: arChart.id,
                initial_balance: 0,
                is_active: true,
                created_by: user.id,
              })
              .select("id")
              .single()
            arAccount = newAR
          }

          if (arAccount) {
            let exchangeRate: number | null = null
            if (sale_currency === "USD") {
              exchangeRate = await getExchangeRate(supabase, departureDate ? new Date(departureDate) : new Date())
              if (!exchangeRate) exchangeRate = await getLatestExchangeRate(supabase)
              if (!exchangeRate) exchangeRate = 1450
            }

            const amountARS = calculateARSEquivalent(saleAmount, sale_currency as "ARS" | "USD", exchangeRate)

            const ledgerIncome = await createLedgerMovement(
              {
                operation_id: operationId,
                lead_id: null,
                type: "INCOME",
                concept: `Servicio ${serviceLabel} - Operación ${fileCode}`,
                currency: sale_currency as "ARS" | "USD",
                amount_original: saleAmount,
                exchange_rate: exchangeRate,
                amount_ars_equivalent: amountARS,
                method: "OTHER",
                account_id: arAccount.id,
                seller_id: operation.seller_id,
                operator_id: null,
                receipt_number: null,
                notes: description || null,
                created_by: user.id,
              },
              supabase
            )

            if (ledgerIncome?.id) {
              updates.ledger_income_id = ledgerIncome.id
            }
          }
        }
      } catch (error) {
        console.error("[Services POST] Error en ledger INCOME:", error)
      }
    }

    // ── 5. Ledger: EXPENSE en Cuentas por Pagar ────────────
    if (costAmount > 0 && operator_id) {
      try {
        const { data: apChart } = await (supabase.from("chart_of_accounts") as any)
          .select("id")
          .eq("account_code", "2.1.01")
          .eq("is_active", true)
          .maybeSingle()

        if (apChart) {
          let { data: apAccount } = await (supabase.from("financial_accounts") as any)
            .select("id")
            .eq("chart_account_id", apChart.id)
            .eq("is_active", true)
            .maybeSingle()

          if (!apAccount) {
            const { data: newAP } = await (supabase.from("financial_accounts") as any)
              .insert({
                name: "Cuentas por Pagar",
                type: "ASSETS",
                currency: cost_currency,
                chart_account_id: apChart.id,
                initial_balance: 0,
                is_active: true,
                created_by: user.id,
              })
              .select("id")
              .single()
            apAccount = newAP
          }

          if (apAccount) {
            let exchangeRate: number | null = null
            if (cost_currency === "USD") {
              exchangeRate = await getExchangeRate(supabase, departureDate ? new Date(departureDate) : new Date())
              if (!exchangeRate) exchangeRate = await getLatestExchangeRate(supabase)
              if (!exchangeRate) exchangeRate = 1450
            }

            const amountARS = calculateARSEquivalent(costAmount, cost_currency as "ARS" | "USD", exchangeRate)

            const ledgerExpense = await createLedgerMovement(
              {
                operation_id: operationId,
                lead_id: null,
                type: "EXPENSE",
                concept: `Costo Servicio ${serviceLabel} - Operación ${fileCode}`,
                currency: cost_currency as "ARS" | "USD",
                amount_original: costAmount,
                exchange_rate: exchangeRate,
                amount_ars_equivalent: amountARS,
                method: "OTHER",
                account_id: apAccount.id,
                seller_id: operation.seller_id,
                operator_id: operator_id,
                receipt_number: null,
                notes: description || null,
                created_by: user.id,
              },
              supabase
            )

            if (ledgerExpense?.id) {
              updates.ledger_expense_id = ledgerExpense.id
            }
          }
        }
      } catch (error) {
        console.error("[Services POST] Error en ledger EXPENSE:", error)
      }
    }

    // ── 6. Comisión al vendedor (solo TRANSFER y ASSISTANCE) ──
    if (generatesCommission && operation.seller_id) {
      try {
        // Calcular margen del servicio (solo si misma moneda, sino usar sale_amount como base)
        const marginBase =
          sale_currency === cost_currency
            ? saleAmount - costAmount
            : saleAmount

        if (marginBase > 0) {
          // Buscar regla de comisión activa (misma lógica que calculate.ts)
          const today = new Date().toISOString().split("T")[0]

          const { data: regionRules } = await (supabase.from("commission_rules") as any)
            .select("*")
            .eq("type", "SELLER")
            .lte("valid_from", today)
            .or(`valid_to.is.null,valid_to.gte.${today}`)
            .eq("destination_region", operation.destination)
            .order("valid_from", { ascending: false })
            .limit(1)

          let rule = regionRules?.[0] || null

          if (!rule) {
            const { data: generalRules } = await (supabase.from("commission_rules") as any)
              .select("*")
              .eq("type", "SELLER")
              .lte("valid_from", today)
              .or(`valid_to.is.null,valid_to.gte.${today}`)
              .is("destination_region", null)
              .order("valid_from", { ascending: false })
              .limit(1)
            rule = generalRules?.[0] || null
          }

          if (rule) {
            let commissionAmount = 0
            let commissionPercentage = 0

            if (rule.basis === "FIXED_PERCENTAGE") {
              commissionPercentage = rule.value
              commissionAmount = Math.round((marginBase * rule.value) / 100 * 100) / 100
            } else if (rule.basis === "FIXED_AMOUNT") {
              commissionAmount = rule.value
              commissionPercentage = marginBase > 0 ? (rule.value / marginBase) * 100 : 0
            }

            if (commissionAmount > 0) {
              const { data: existingRecord } = await (supabase.from("commission_records") as any)
                .select("id, amount")
                .eq("operation_id", operationId)
                .eq("seller_id", operation.seller_id)
                .maybeSingle()

              if (existingRecord) {
                // Sumar al registro existente
                const { data: updated } = await (supabase.from("commission_records") as any)
                  .update({
                    amount: existingRecord.amount + commissionAmount,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingRecord.id)
                  .select("id")
                  .single()

                if (updated?.id) updates.commission_record_id = updated.id
              } else {
                // Crear nuevo registro
                const { data: newRecord } = await (supabase.from("commission_records") as any)
                  .insert({
                    operation_id: operationId,
                    seller_id: operation.seller_id,
                    agency_id: operation.agency_id,
                    amount: commissionAmount,
                    percentage: commissionPercentage,
                    status: "PENDING",
                    date_calculated: new Date().toISOString(),
                  })
                  .select("id")
                  .single()

                if (newRecord?.id) updates.commission_record_id = newRecord.id
              }
            }
          }
        }
      } catch (error) {
        console.error("[Services POST] Error calculando comisión:", error)
      }
    }

    // ── 7. Guardar IDs de registros contables en el servicio ──
    if (Object.keys(updates).length > 0) {
      await (supabase.from("operation_services") as any)
        .update(updates)
        .eq("id", serviceId)
    }

    // Retornar servicio completo con operador
    const { data: finalService } = await (supabase.from("operation_services") as any)
      .select(`*, operators:operator_id(id, name)`)
      .eq("id", serviceId)
      .single()

    return NextResponse.json({ service: finalService }, { status: 201 })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[Services POST] Error inesperado:", error)
    return NextResponse.json({ error: error.message || "Error al crear servicio" }, { status: 500 })
  }
}
