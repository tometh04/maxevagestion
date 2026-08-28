import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction, getUserAgencyIds, resolveOperationAccessScope, isAgencyReadonlyScope } from "@/lib/permissions-api"
import { recalculateOperationCommissions, getSellerPercentage } from "@/lib/commissions/calculate"
import {
  serviceCommissionAmount,
  serviceGeneratesCommission,
} from "@/lib/commissions/service-commission"
import { getOpenOperatorPaymentStatus } from "@/lib/accounting/operator-payment-settlement"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { shouldSkipOperatorModelRecalc } from "@/lib/operations/recalc-guard"
import { getExchangeRate } from "@/lib/accounting/exchange-rates"

// Epsilon monetario para comparar montos (evita falsos negativos por float).
const MONEY_EPSILON = 0.005

/**
 * Calcula el nuevo `amount` de un operator_payment al re-sincronizar contra un
 * costo editado, sin romper el invariante `paid_amount ≤ amount`. Si el costo
 * baja por debajo de lo ya pagado, se topa en `paid_amount` (deuda saldada) en
 * vez de dejar amount < paid (pendiente negativo) o conservar un amount viejo
 * (pendiente fantasma). Ver A5 auditoría cost-decrease.
 */
function reconcileOperatorPaymentAmount(newCostAmount: number, paidAmount: number, dueDate: string | null) {
  const targetAmount = Math.max(newCostAmount, paidAmount)
  const fullyPaid = paidAmount + MONEY_EPSILON >= targetAmount
  return {
    amount: targetAmount,
    status: fullyPaid ? ("PAID" as const) : getOpenOperatorPaymentStatus(dueDate),
    belowPaid: newCostAmount < paidAmount,
  }
}

/**
 * Recalcula los totales de la operación (sale_amount_total, operator_cost, margin)
 * sumando los valores de todos sus servicios, y luego recalcula las comisiones.
 *
 * IMPORTANTE: solo se suman los servicios cuya moneda coincide con la moneda
 * base de la operación. Sumar montos en monedas distintas como si fueran iguales
 * produce una "dolarización 1:1" (ej: 50.000 ARS de un transfer se sumaban como
 * 50.000 USD al total de una op en USD). Los servicios en otra moneda quedan
 * fuera de los totales agregados — la UI ya los muestra en sus propios totales
 * por moneda (ver OperationAccountingSection.servicesInOtherCurrency).
 */
async function recalculateOperationTotals(supabase: any, operationId: string) {
  // Obtener la moneda base de la operación para filtrar servicios.
  const { data: opCurrencyRow } = await (supabase.from("operations") as any)
    .select("sale_currency, operator_cost_currency, currency, org_id")
    .eq("id", operationId)
    .single()

  if (!opCurrencyRow) return

  // 🔴 Flag include_services_in_sale_total (2026-07-03): con la flag ON, la venta
  // de los servicios se suma a sale_amount_total EN READ-TIME (endpoints/RPC), y
  // sale_amount_total representa SIEMPRE la venta base pura. Si acá lo
  // sobreescribiéramos con Σservicios, la deuda pasaría a contar doble
  // (base+Σsvc en read-time sobre un total que ya es Σsvc) y perderíamos la base
  // en ops mixtas. Por eso, con la flag ON, NO tocamos los totales de la op:
  // los gestiona el read-time. Con la flag OFF se conserva el comportamiento
  // legacy (recalc pisa los totales desde servicios).
  const includeServices = await getOrgFeatureFlag(
    supabase, opCurrencyRow.org_id, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
  )
  if (includeServices) return

  const opSaleCurrency = opCurrencyRow.sale_currency || opCurrencyRow.currency || "USD"
  const opCostCurrency = opCurrencyRow.operator_cost_currency || opCurrencyRow.currency || "USD"

  // Contar operadores: define si la op usa el modelo operador (ver guard abajo).
  const { count: operatorRowCount } = await (supabase.from("operation_operators") as any)
    .select("id", { count: "exact", head: true })
    .eq("operation_id", operationId)

  // Sumar todos los servicios activos de la operación, separando por moneda.
  const { data: services } = await (supabase.from("operation_services") as any)
    .select("sale_amount, sale_currency, cost_amount, cost_currency")
    .eq("operation_id", operationId)

  if (!services) return

  // 🔴 GUARD modelo operador (incidentes VICO a3bb84e1 y OP-20260518-3C89DA03):
  // NO sobreescribir los totales de la operación a partir de operation_services
  // cuando la op usa el modelo operador. Existen dos modelos de compra
  // independientes:
  //   - operation_services (modelo nuevo: hoteles/vuelos/transfers por servicio)
  //   - operation_operators / campos base en operations (modelo operador)
  // El POST de servicios NUNCA escribe operation_operators, así que una op
  // cargada por el modelo operador tiene 0 operation_services. Si un usuario
  // agrega un servicio y luego lo borra (→ 0 servicios) o lo edita (→ 1 servicio
  // con sale/cost 0), esta función sumaba ese set y ponía sale_amount_total /
  // operator_cost / margin = 0, destruyendo los totales reales (que siguen
  // vivos en operation_operators y operator_payments).
  // Regla: si hay operadores, o no quedan servicios, los totales los gestiona el
  // otro modelo (trigger operation_operators / edición manual) — no tocar nada.
  if (shouldSkipOperatorModelRecalc(operatorRowCount ?? 0, services.length)) return

  const totalSale = (services as any[]).reduce((sum: number, s: any) => {
    return s.sale_currency === opSaleCurrency ? sum + (Number(s.sale_amount) || 0) : sum
  }, 0)
  const totalCost = (services as any[]).reduce((sum: number, s: any) => {
    return s.cost_currency === opCostCurrency ? sum + (Number(s.cost_amount) || 0) : sum
  }, 0)
  const margin = totalSale - totalCost
  const marginPct = totalSale > 0 ? (margin / totalSale) * 100 : 0

  // Actualizar la operación con los nuevos totales
  await (supabase.from("operations") as any)
    .update({
      sale_amount_total: totalSale,
      operator_cost: totalCost,
      margin_amount: margin,
      margin_percentage: Math.round(marginPct * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", operationId)

  // Obtener la operación actualizada para recalcular comisiones
  // El select tiene que traer org_id y los commission_pct_*: sin ellos el
  // recálculo no sabía en qué modo estaba la operación y la degradaba.
  const { data: updatedOp } = await (supabase.from("operations") as any)
    .select("id, org_id, agency_id, operation_date, seller_id, seller_secondary_id, commission_pct_primary, commission_pct_secondary, commission_split_mode, margin_amount")
    .eq("id", operationId)
    .single()

  if (updatedOp && updatedOp.seller_id) {
    try {
      await recalculateOperationCommissions(supabase, {
        ...updatedOp,
        margin_amount: Number(updatedOp.margin_amount) || 0,
      })
    } catch (err) {
      console.warn("[Services] Error recalculando comisiones:", err)
    }
  }
}

// Campos editables del servicio (whitelist)
const EDITABLE_FIELDS = [
  "service_type", "description", "operator_id",
  "sale_amount", "sale_currency", "cost_amount", "cost_currency",
  // Hotel
  "hotel_name", "hotel_stars", "hotel_address", "hotel_phone",
  "room_type", "meal_plan", "checkin_date", "checkout_date", "nights", "rooms",
  // Flight
  "airline", "flight_route", "flight_date", "flight_return_date", "flight_stops", "flight_class",
]

// ─────────────────────────────────────────────
// PATCH: Editar un servicio de una operación
// Actualiza campos del servicio y recalcula
// registros contables si cambian los montos
// ─────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; serviceId: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para editar servicios" }, { status: 403 })
    }

    const { id: operationId, serviceId } = await params
    const supabase = await createServerClient()

    // Cross-tenant fix (2026-05-18): scopear fetch por org del user.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Verificar operación
    const { data: operation, error: opError } = await (supabase.from("operations") as any)
      // `sale_currency`/`currency`: la comision del servicio se guarda en la
      // moneda de la OPERACION (ver service-commission.ts).
      .select("id, seller_id, status, agency_id, file_code, destination, departure_date, sale_currency, currency")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (opError || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const accessScope = resolveOperationAccessScope(user, operation, agencyIds)

    if (!accessScope || isAgencyReadonlyScope(accessScope)) {
      return NextResponse.json({ error: "No tiene acceso a esta operación" }, { status: 403 })
    }

    if (operation.status === "CANCELLED") {
      return NextResponse.json({ error: "No se puede editar servicios de una operación cancelada" }, { status: 400 })
    }

    // Obtener servicio actual
    const { data: currentService, error: serviceError } = await (supabase.from("operation_services") as any)
      .select("*")
      .eq("id", serviceId)
      .eq("operation_id", operationId)
      .single()

    if (serviceError || !currentService) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    const body = await request.json()

    // Filtrar solo campos editables
    const updateData: Record<string, any> = {}
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No se proporcionaron campos para actualizar" }, { status: 400 })
    }

    // Validaciones
    if (updateData.sale_amount !== undefined && Number(updateData.sale_amount) < 0) {
      return NextResponse.json({ error: "El precio de venta debe ser >= 0" }, { status: 400 })
    }
    if (updateData.cost_amount !== undefined && Number(updateData.cost_amount) < 0) {
      return NextResponse.json({ error: "El costo debe ser >= 0" }, { status: 400 })
    }
    if (updateData.sale_currency && !["ARS", "USD"].includes(updateData.sale_currency)) {
      return NextResponse.json({ error: "Moneda de venta inválida" }, { status: 400 })
    }
    if (updateData.cost_currency && !["ARS", "USD"].includes(updateData.cost_currency)) {
      return NextResponse.json({ error: "Moneda de costo inválida" }, { status: 400 })
    }

    // Convertir tipos numéricos
    if (updateData.sale_amount !== undefined) updateData.sale_amount = Number(updateData.sale_amount)
    if (updateData.cost_amount !== undefined) updateData.cost_amount = Number(updateData.cost_amount)
    if (updateData.hotel_stars !== undefined) updateData.hotel_stars = updateData.hotel_stars ? Number(updateData.hotel_stars) : null
    if (updateData.nights !== undefined) updateData.nights = updateData.nights ? Number(updateData.nights) : null
    if (updateData.rooms !== undefined) updateData.rooms = updateData.rooms ? Number(updateData.rooms) : null
    if (updateData.flight_stops !== undefined) updateData.flight_stops = updateData.flight_stops != null ? Number(updateData.flight_stops) : 0

    // `generates_commission` se deriva del tipo, así que tiene que seguirlo.
    // `service_type` es editable, pero el flag se calculaba sólo en el alta y
    // después quedaba congelado: un SEAT convertido a HOTEL no comisionaba
    // nunca, y un HOTEL convertido a VISA seguía comisionando para siempre.
    if (updateData.service_type !== undefined) {
      updateData.generates_commission = serviceGeneratesCommission(updateData.service_type)
    }

    updateData.updated_at = new Date().toISOString()

    // Actualizar servicio
    const { data: updatedService, error: updateError } = await (supabase.from("operation_services") as any)
      .update(updateData)
      .eq("id", serviceId)
      .select("*, operators:operator_id(id, name)")
      .single()

    if (updateError) {
      console.error("[Services PATCH] Error actualizando servicio:", updateError)
      return NextResponse.json({ error: "Error al actualizar el servicio" }, { status: 500 })
    }

    const warnings: string[] = []

    // ── Actualizar registros contables si cambiaron los montos ──
    const saleChanged = updateData.sale_amount !== undefined && updateData.sale_amount !== Number(currentService.sale_amount)
    const costChanged = updateData.cost_amount !== undefined && updateData.cost_amount !== Number(currentService.cost_amount)

    // Actualizar ledger INCOME si cambió sale_amount
    if (saleChanged && currentService.ledger_income_id) {
      const { error: ledgerErr } = await (supabase.from("ledger_movements") as any)
        .update({ amount_original: updateData.sale_amount, updated_at: new Date().toISOString() })
        .eq("id", currentService.ledger_income_id)
      if (ledgerErr) warnings.push("No se pudo actualizar el movimiento contable de ingreso")
    }

    // Actualizar ledger EXPENSE si cambió cost_amount
    if (costChanged && currentService.ledger_expense_id) {
      const { error: ledgerErr } = await (supabase.from("ledger_movements") as any)
        .update({ amount_original: updateData.cost_amount, updated_at: new Date().toISOString() })
        .eq("id", currentService.ledger_expense_id)
      if (ledgerErr) warnings.push("No se pudo actualizar el movimiento contable de gasto")
    }

    // Sincronizar operator_payment cuando se envía cost_amount en el request.
    // Se compara contra operator_payments.amount (no contra el valor previo del servicio)
    // para corregir desincronizaciones previas aunque el costo "no haya cambiado" en la UI.
    if (updateData.cost_amount !== undefined) {
      const newCostAmount = Number(updateData.cost_amount)
      const effectiveOperatorId = updateData.operator_id !== undefined ? updateData.operator_id : currentService.operator_id

      if (currentService.operator_payment_id) {
        const { data: opPayment } = await (supabase.from("operator_payments") as any)
          .select("id, status, amount, paid_amount, due_date")
          .eq("id", currentService.operator_payment_id)
          .eq("org_id", (user as any).org_id)
          .single()

        if (opPayment?.status === "PAID") {
          if (costChanged) warnings.push("El pago al operador ya fue registrado como pagado. El monto no se actualizó automáticamente.")
        } else if (opPayment && Number(opPayment.amount) !== newCostAmount) {
          // Clamp para no dejar amount < paid_amount (pendiente negativo/fantasma).
          const paidAmount = Number(opPayment.paid_amount || 0)
          const rec = reconcileOperatorPaymentAmount(newCostAmount, paidAmount, opPayment.due_date)
          await (supabase.from("operator_payments") as any)
            .update({ amount: rec.amount, status: rec.status, updated_at: new Date().toISOString() })
            .eq("id", currentService.operator_payment_id)
            .eq("org_id", (user as any).org_id)
          if (rec.belowPaid) {
            warnings.push(`El nuevo costo (${newCostAmount}) es menor a lo ya pagado (${paidAmount}); la deuda quedó saldada.`)
          }
        }
      } else if (effectiveOperatorId) {
        // Fallback: el servicio no tiene operator_payment_id vinculado, buscar por operation_id + operator_id
        const { data: opPayment } = await (supabase.from("operator_payments") as any)
          .select("id, status, amount, paid_amount, due_date")
          .eq("operation_id", operationId)
          .eq("operator_id", effectiveOperatorId)
          .eq("org_id", (user as any).org_id)
          .neq("status", "PAID")
          .order("created_at", { ascending: true })
          .maybeSingle()

        if (opPayment && Number(opPayment.amount) !== newCostAmount) {
          const paidAmount = Number(opPayment.paid_amount || 0)
          const rec = reconcileOperatorPaymentAmount(newCostAmount, paidAmount, opPayment.due_date)
          const { error: opPayErr } = await (supabase.from("operator_payments") as any)
            .update({ amount: rec.amount, status: rec.status, updated_at: new Date().toISOString() })
            .eq("id", opPayment.id)
            .eq("org_id", (user as any).org_id)

          if (!opPayErr) {
            if (rec.belowPaid) {
              warnings.push(`El nuevo costo (${newCostAmount}) es menor a lo ya pagado (${paidAmount}); la deuda quedó saldada.`)
            }
            // Vincular para futuros updates
            await (supabase.from("operation_services") as any)
              .update({ operator_payment_id: opPayment.id })
              .eq("id", serviceId)
          }
        }
      }
    }

    // ── Resincronizar la comisión propia del servicio ──
    //
    // La comisión de un servicio es una fila aparte (`kind = 'SERVICE'`) que el
    // recálculo de la operación deliberadamente no toca —tiene su propio
    // vendedor, su propio porcentaje y su propio mes—, así que si no se
    // actualiza acá se queda con el monto viejo para siempre. Antes esto no se
    // notaba porque la comisión del servicio vivía sumada a la de la venta.
    //
    // El mes (`accrual_date`) NO se toca: editar un importe no cambia cuándo se
    // vendió el servicio, y moverlo correría la comisión de período.
    const typeChanged =
      updateData.service_type !== undefined &&
      updateData.service_type !== currentService.service_type

    if (saleChanged || costChanged || typeChanged) {
      try {
        const stillCommissions = updatedService.generates_commission === true
        const sellerId = updatedService.seller_id

        const { data: existingCommission } = await (supabase.from("commission_records") as any)
          .select("id, status, amount_paid, percentage")
          .eq("operation_id", operationId)
          .eq("operation_service_id", serviceId)
          .eq("kind", "SERVICE")
          .maybeSingle()

        const locked =
          existingCommission &&
          ((existingCommission.status ?? "PENDING") !== "PENDING" ||
            Number(existingCommission.amount_paid ?? 0) > 0)

        if (locked) {
          // Bajarle el monto a una comisión ya cobrada dejaría el asiento sin
          // respaldo; subírsela habilitaría un doble pago. Se avisa y se deja
          // para ajuste manual.
          warnings.push(
            "La comisión de este servicio ya fue pagada: el monto no se actualizó automáticamente."
          )
        } else if (sellerId) {
          const sellerPct = Number(
            existingCommission?.percentage ??
              (await getSellerPercentage(supabase, (user as any).org_id, sellerId))
          )

          // La comisión se expresa en la moneda de la OPERACIÓN. Si el servicio
          // está cargado en otra, hay que convertir: `commission_records` no
          // guarda moneda y el importe se lee asumiendo la de la operación.
          const svcSaleCurrency = String(updatedService.sale_currency ?? "ARS")
          const operationCurrency = String(operation.sale_currency || operation.currency || "USD")
          let serviceRate: number | null = null
          if (svcSaleCurrency !== operationCurrency) {
            serviceRate = await getExchangeRate(supabase, new Date())
          }

          const commissionAmount = serviceCommissionAmount({
            saleAmount: Number(updatedService.sale_amount ?? 0),
            costAmount: Number(updatedService.cost_amount ?? 0),
            saleCurrency: svcSaleCurrency,
            costCurrency: String(updatedService.cost_currency ?? "ARS"),
            sellerPercentage: sellerPct,
            operationCurrency,
            exchangeRate: serviceRate,
          })

          if (commissionAmount === null) {
            // Hacía falta convertir y no hay tipo de cambio. Se avisa y NO se
            // toca la comisión existente: dejarla como está es mejor que
            // pisarla con un importe que no se pudo valuar.
            warnings.push(
              "No se pudo actualizar la comisión del servicio: falta el tipo de cambio para convertirla a la moneda de la operación."
            )
          } else if (!stillCommissions || commissionAmount <= 0) {
            // Dejó de comisionar (cambió a un tipo sin comisión, o el margen se
            // fue a cero o a pérdida): la fila no debe quedar viva.
            if (existingCommission) {
              await (supabase.from("commission_records") as any)
                .delete()
                .eq("id", existingCommission.id)
              await (supabase.from("operation_services") as any)
                .update({ commission_record_id: null })
                .eq("id", serviceId)
            }
          } else if (existingCommission) {
            await (supabase.from("commission_records") as any)
              .update({
                amount: commissionAmount,
                percentage: sellerPct,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingCommission.id)
          } else {
            // Pasó a comisionar recién ahora (p. ej. VISA → HOTEL).
            const nowIso = new Date().toISOString()
            const { data: created } = await (supabase.from("commission_records") as any)
              .insert({
                operation_id: operationId,
                operation_service_id: serviceId,
                seller_id: sellerId,
                org_id: (user as any).org_id,
                agency_id: operation.agency_id,
                kind: "SERVICE",
                amount: commissionAmount,
                percentage: sellerPct,
                status: "PENDING",
                date_calculated: nowIso,
                accrual_date: nowIso.slice(0, 10),
              })
              .select("id")
              .single()

            if (created?.id) {
              await (supabase.from("operation_services") as any)
                .update({ commission_record_id: created.id })
                .eq("id", serviceId)
            }
          }
        }
      } catch (err) {
        console.error("[Services PATCH] Error resincronizando la comisión del servicio:", err)
        warnings.push("No se pudo actualizar la comisión de este servicio automáticamente")
      }
    }

    // ── Recalcular totales de la operación y comisiones si cambiaron montos ──
    if (saleChanged || costChanged) {
      try {
        await recalculateOperationTotals(supabase, operationId)
      } catch (err) {
        console.warn("[Services PATCH] Error recalculando totales:", err)
        warnings.push("No se pudieron recalcular los totales de la operación automáticamente")
      }
    }

    return NextResponse.json({
      service: updatedService,
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[Services PATCH] Error inesperado:", error)
    return NextResponse.json({ error: error.message || "Error al editar servicio" }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// DELETE: Eliminar un servicio de una operación
// Reversa los registros contables asociados
// solo si aún están PENDING (no pagados)
// ─────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; serviceId: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar servicios" }, { status: 403 })
    }

    const { id: operationId, serviceId } = await params
    const supabase = await createServerClient()

    // Cross-tenant fix (2026-05-18): scopear fetch por org del user.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Verificar que la operación existe y el usuario tiene acceso
    const { data: operation, error: opError } = await (supabase.from("operations") as any)
      .select("id, seller_id, status, org_id")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (opError || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const accessScope = resolveOperationAccessScope(user, operation, agencyIds)

    if (!accessScope || isAgencyReadonlyScope(accessScope)) {
      return NextResponse.json({ error: "No tiene acceso a esta operación" }, { status: 403 })
    }

    // Obtener el servicio con sus IDs contables
    const { data: service, error: serviceError } = await (supabase.from("operation_services") as any)
      .select("*")
      .eq("id", serviceId)
      .eq("operation_id", operationId)
      .single()

    if (serviceError || !service) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    const warnings: string[] = []

    // ── Eliminar payment (deuda cliente) si está PENDING ──
    if (service.payment_id) {
      const { data: payment } = await (supabase.from("payments") as any)
        .select("id, status")
        .eq("id", service.payment_id)
        .single()

      if (payment?.status === "PAID") {
        warnings.push("El pago del cliente ya fue registrado como pagado y no se puede revertir automáticamente.")
      } else if (payment) {
        await (supabase.from("payments") as any)
          .delete()
          .eq("id", service.payment_id)
      }
    }

    // ── Eliminar operator_payment(s) vinculados al servicio ──
    // Todos los operator_payments tienen org_id seteado (migración 2026-06-02),
    // por lo que el user client con RLS alcanza para todas las operaciones.
    if (service.operator_payment_id) {
      const { data: opPayment } = await (supabase.from("operator_payments") as any)
        .select("id, status")
        .eq("id", service.operator_payment_id)
        .eq("org_id", (user as any).org_id)
        .maybeSingle()

      if (opPayment?.status === "PAID") {
        warnings.push("El pago al proveedor ya fue registrado como pagado y no se puede revertir automáticamente.")
      } else if (opPayment) {
        await (supabase.from("operator_payments") as any)
          .delete()
          .eq("id", service.operator_payment_id)
      }
    }

    // Limpiar cualquier ghost remanente para este operador/operación
    // (registros de ediciones previas sin operator_payment_id en el servicio)
    if (service.operator_id) {
      await (supabase.from("operator_payments") as any)
        .delete()
        .eq("operation_id", operationId)
        .eq("operator_id", service.operator_id)
        .eq("org_id", (user as any).org_id)
        .neq("status", "PAID")
        .neq("id", service.operator_payment_id || "00000000-0000-0000-0000-000000000000")
    }

    // ── Eliminar ledger movements ──
    // Solo si existen (si el pago ya está hecho el ledger igual se borra,
    // ya que el pago real genera su propio ledger movement al marcarse PAID)
    if (service.ledger_income_id) {
      await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("id", service.ledger_income_id)
    }

    if (service.ledger_expense_id) {
      await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("id", service.ledger_expense_id)
    }

    // ── Revertir la comisión DEL SERVICIO si existe y está PENDING ──
    //
    // El `kind = 'SERVICE'` del filtro es la parte importante: antes se borraba
    // el registro apuntado por `commission_record_id` sin más, y ese registro
    // era la comisión de (operación, vendedor) — o sea que borrar un servicio le
    // volaba al vendedor TODA la comisión de la operación, incluida la de la
    // venta base y la de los demás servicios. Ahora cada servicio tiene su
    // propia fila y sólo se lleva la suya.
    if (service.commission_record_id && service.generates_commission) {
      const { data: commRecord } = await (supabase.from("commission_records") as any)
        .select("id, status, amount, amount_paid, kind")
        .eq("id", service.commission_record_id)
        .eq("kind", "SERVICE")
        .maybeSingle()

      if (commRecord && ((commRecord.status ?? "PENDING") !== "PENDING" || Number(commRecord.amount_paid ?? 0) > 0)) {
        warnings.push("La comisión del vendedor ya fue pagada y no se puede revertir automáticamente.")
      } else if (commRecord) {
        await (supabase.from("commission_records") as any)
          .delete()
          .eq("id", commRecord.id)
      }
    }

    // ── Eliminar el servicio ──
    const { error: deleteError } = await (supabase.from("operation_services") as any)
      .delete()
      .eq("id", serviceId)

    if (deleteError) {
      console.error("[Services DELETE] Error eliminando servicio:", deleteError)
      return NextResponse.json({ error: "Error al eliminar el servicio" }, { status: 500 })
    }

    // ── Recalcular totales de la operación y comisiones tras eliminar servicio ──
    try {
      await recalculateOperationTotals(supabase, operationId)
    } catch (err) {
      console.warn("[Services DELETE] Error recalculando totales:", err)
      warnings.push("No se pudieron recalcular los totales de la operación automáticamente")
    }

    return NextResponse.json({
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[Services DELETE] Error inesperado:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar servicio" }, { status: 500 })
  }
}
