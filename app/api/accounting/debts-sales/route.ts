import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { applyCustomersFilters } from "@/lib/permissions-api"
import { buildExchangeRateMap, getLatestExchangeRate, DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener filtros de query params
    const currencyFilter = searchParams.get("currency") // "ALL" | "USD" | "ARS"
    const customerIdFilter = searchParams.get("customerId") // ID de cliente
    const sellerIdFilter = searchParams.get("sellerId") // ID de vendedor
    const dateFromFilter = searchParams.get("dateFrom") // YYYY-MM-DD
    const dateToFilter = searchParams.get("dateTo") // YYYY-MM-DD
    const dateType = (searchParams.get("dateType") || "SALIDA").toUpperCase() // SALIDA (departure_date) | CREACION (created_at)
    const agencyIdFilter = searchParams.get("agencyId") // ID de agencia/oficina | "ALL"

    // Get user agencies + resolver permisos dinámicos
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = (user as any).org_id
      ? await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIds)
      : null
    if (!assertPermission(user.role, perms, "accounting", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver esta sección" }, { status: 403 })
    }

    // Build base query — .select() FIRST so applyCustomersFilters can chain .eq()
    //
    // Perf 2026-05-06: antes hacíamos `select("*")` y traíamos TODAS las
    // columnas de customers (~30+ campos incluyendo custom_fields JSONB,
    // notes, address, dietary_restrictions, etc.). El page client solo usa
    // 6 campos. Bajamos el payload ~70% y aliviamos serialización RLS.
    // Perf 2026-05-06: usamos `operation_customers!inner` para que customers
    // sin operaciones quedan fuera ya en la query (antes los traíamos y
    // filtrábamos en JS). En tenants con miles de leads que nunca llegaron
    // a operation, esto elimina ~80% del resultset. Mismo patrón se podrá
    // aplicar al join interno con `operations!inner` cuando confirmemos
    // que ningún operation_customers tiene operation_id NULL.
    let query = supabase.from("customers").select(`
        id, first_name, last_name, email, phone, document_number, document_type,
        operation_customers!inner(
          operation_id,
          operations:operation_id(
            id,
            file_code,
            destination,
            sale_amount_total,
            sale_currency,
            currency,
            status,
            departure_date,
            created_at,
            seller_id,
            agency_id
          )
        )
      `)

    try {
      const applied = await applyCustomersFilters(query, user, agencyIds, supabase)
      query = applied.query
    } catch (error: any) {
      console.error("Error applying customers filters:", error)
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    const { data: customers, error: customersError } = await query
      .order("created_at", { ascending: false })

    if (customersError) {
      console.error("Error fetching customers:", customersError)
      return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
    }

    // Get all operation IDs
    const allOperationIds: string[] = []
    customers?.forEach((customer: any) => {
      customer.operation_customers?.forEach((oc: any) => {
        if (oc.operation_id) {
          allOperationIds.push(oc.operation_id)
        }
      })
    })

    // Get all payments for these operations (chunked: .in() revienta URL con >300 UUIDs).
    // Defense-in-depth (2026-05-18): aunque los operation_ids ya vienen del filtro
    // de applyCustomersFilters (scoped al org del user), agregamos .eq("org_id")
    // explícito a la query de payments por la regla canónica de no confiar en RLS.
    // Guardamos los pagos PAID crudos por operación. La conversión a la moneda
    // de la venta (y luego a USD) se hace en el loop principal, donde ya tenemos
    // la tasa de la operación. Antes se pre-sumaba a USD y un pago ARS sin
    // exchange_rate ni amount_usd se contaba como 0 → operaciones ARS pagadas
    // en ARS (T/C "-") figuraban como deuda fantasma.
    // Deuda NETA: cobros INCOME (+) − devoluciones EXPENSE (-) del cliente. Por
    // eso ya NO filtramos direction=INCOME: traemos ambas y guardamos el signo.
    type RawPayment = { amount: number; currency: string; exchange_rate: number | null; amount_usd: number | null; sign: number }
    let paymentsByOperation: Record<string, RawPayment[]> = {}
    if (allOperationIds.length > 0 && (user as any).org_id) {
      const userOrgId = (user as any).org_id as string
      const chunkSize = 200
      for (let i = 0; i < allOperationIds.length; i += chunkSize) {
        const chunk = allOperationIds.slice(i, i + chunkSize)
        const { data: payments } = await supabase
          .from("payments")
          .select("operation_id, amount, amount_usd, currency, exchange_rate, status, direction")
          .in("operation_id", chunk)
          .eq("org_id", userOrgId)
          .eq("payer_type", "CUSTOMER")

        if (payments) {
          payments.forEach((payment: any) => {
            if (payment.status !== "PAID") return
            if (payment.direction !== "INCOME" && payment.direction !== "EXPENSE") return
            const opId = payment.operation_id
            ;(paymentsByOperation[opId] ||= []).push({
              amount: Number(payment.amount) || 0,
              currency: payment.currency || "ARS",
              exchange_rate: payment.exchange_rate != null ? Number(payment.exchange_rate) : null,
              amount_usd: payment.amount_usd != null ? Number(payment.amount_usd) : null,
              sign: payment.direction === "EXPENSE" ? -1 : 1,
            })
          })
        }
      }
    }

    // Dedup de operaciones compartidas (paquetes con varios pasajeros):
    // la deuda de la operación se cuenta UNA sola vez, atribuida al pasajero
    // TITULAR (role MAIN). Antes se sumaba la deuda TOTAL a CADA pasajero, así
    // un paquete de 3 figuraba con la deuda ×3 (uno por pasajero).
    // Si la operación no tiene MAIN, fallback determinístico al primer customer_id.
    const opOwnerCustomerId: Record<string, string> = {}
    if (allOperationIds.length > 0 && (user as any).org_id) {
      const userOrgId = (user as any).org_id as string
      const chunkSize = 200
      for (let i = 0; i < allOperationIds.length; i += chunkSize) {
        const chunk = allOperationIds.slice(i, i + chunkSize)
        const { data: ocRows } = await supabase
          .from("operation_customers")
          .select("operation_id, customer_id, role")
          .in("operation_id", chunk)
          .eq("org_id", userOrgId)
        if (ocRows) {
          for (const oc of ocRows as any[]) {
            if (!oc.operation_id || !oc.customer_id) continue
            // Fallback: primer pasajero visto. El MAIN siempre sobreescribe.
            if (!opOwnerCustomerId[oc.operation_id] || oc.role === "MAIN") {
              opOwnerCustomerId[oc.operation_id] = oc.customer_id
            }
          }
        }
      }
    }

    // Obtener nombres de vendedores para mostrar en la respuesta
    const sellerIds = new Set<string>()
    customers?.forEach((customer: any) => {
      customer.operation_customers?.forEach((oc: any) => {
        if (oc.operations?.seller_id) {
          sellerIds.add(oc.operations.seller_id)
        }
      })
    })
    
    const sellerNamesMap: Record<string, string> = {}
    if (sellerIds.size > 0) {
      const { data: sellers } = await supabase
        .from("users")
        .select("id, name")
        .in("id", Array.from(sellerIds))
      
      if (sellers) {
        sellers.forEach((seller: any) => {
          sellerNamesMap[seller.id] = seller.name || "Sin nombre"
        })
      }
    }

    // Calculate debt for each customer
    const debtors: Array<{
      customer: any
      totalDebt: number
      currency: string
      operationsWithDebt: Array<{
        id: string
        file_code: string | null
        destination: string
        sale_amount_total: number
        currency: string
        paid: number
        debt: number
        departure_date: string | null
        seller_id: string | null
        seller_name: string | null
      }>
    }> = []

    // Obtener tasa de cambio más reciente como fallback (una sola vez fuera del loop)
    const latestExchangeRate = await getLatestExchangeRate(supabase) || DEFAULT_USD_ARS_FALLBACK_RATE

    // Pre-build exchange rate map en 2 queries (en vez de N queries dentro del loop).
    // Recopilamos todas las fechas de operations ARS de todos los customers.
    // Multi-tenant safe: este map solo cubre fechas de operations que YA pasaron
    // el filtro RLS de customers; no expone tasas a otros tenants (las tasas son
    // globales por definición, no per-tenant).
    const customersList = (customers || []) as any[]
    const allArsDates: (string | null | undefined)[] = []
    for (const customer of customersList) {
      const operations = (customer.operation_customers || []) as any[]
      for (const oc of operations) {
        const operation = oc.operations
        if (!operation) continue
        const saleCurrency = operation.sale_currency || operation.currency || "USD"
        if (saleCurrency === "ARS") {
          allArsDates.push(operation.departure_date || operation.created_at)
        }
      }
    }
    const getRate = await buildExchangeRateMap(supabase, allArsDates)
    for (const customer of customersList) {
      const operations = (customer.operation_customers || []) as any[]
      const operationsWithDebt: Array<{
        id: string
        file_code: string | null
        destination: string
        sale_amount_total: number
        currency: string
        paid: number
        debt: number
        departure_date: string | null
        seller_id: string | null
        seller_name: string | null
      }> = []
      let totalDebt = 0
      let currency = "ARS"

      // Usar for...of para poder usar await correctamente
      for (const oc of operations) {
        const operation = oc.operations
        if (!operation) continue

        // Paquete compartido: solo el pasajero titular (o dueño fallback) acumula
        // la deuda de la operación, para no repetirla en cada pasajero.
        const ownerId = opOwnerCustomerId[operation.id]
        if (ownerId && ownerId !== customer.id) continue

        // Aplicar filtro de vendedor si existe
        if (sellerIdFilter && sellerIdFilter !== "ALL" && operation.seller_id !== sellerIdFilter) {
          continue
        }

        // Aplicar filtro de agencia/oficina si existe (deuda por oficina).
        if (agencyIdFilter && agencyIdFilter !== "ALL" && operation.agency_id !== agencyIdFilter) {
          continue
        }

        // Aplicar filtro de fechas según dateType:
        // - SALIDA (default): operations.departure_date con fallback a created_at
        //   si la operación no tiene fecha de salida (preserva comportamiento legacy).
        // - CREACION: operations.created_at directo, sin fallback.
        // Comparamos como timestamps reales (Date.getTime) con offset AR
        // para evitar el bug de UTC/local que hacía que movimientos del
        // final del día en AR quedaran fuera de rango.
        const opDate = dateType === "CREACION"
          ? operation.created_at
          : (operation.departure_date || operation.created_at)
        if (opDate) {
          const opDateMs = new Date(opDate).getTime()
          if (dateFromFilter) {
            const fromMs = new Date(startOfDayAR(dateFromFilter)).getTime()
            if (Number.isFinite(opDateMs) && Number.isFinite(fromMs) && opDateMs < fromMs) {
              continue
            }
          }
          if (dateToFilter) {
            const toMs = new Date(endOfDayAR(dateToFilter)).getTime()
            if (Number.isFinite(opDateMs) && Number.isFinite(toMs) && opDateMs > toMs) {
              continue
            }
          }
        }

        const opId = operation.id
        const saleCurrency = operation.sale_currency || operation.currency || "USD"
        const saleAmount = Number(operation.sale_amount_total) || 0

        // Tasa ARS/USD de la operación (por fecha, con fallback a la última).
        const operationDate = operation.departure_date || operation.created_at
        const rateForOp = getRate(operationDate) || latestExchangeRate

        // Convertir sale_amount_total a USD (solo si la venta está en ARS).
        const saleAmountUsd = saleCurrency === "ARS" ? saleAmount / rateForOp : saleAmount

        // Sumar los pagos EN LA MONEDA DE LA VENTA y recién después convertir el
        // neto a USD. Así un cobro en ARS (sin T/C) sobre una venta en ARS netea
        // correctamente en vez de contarse como 0 USD.
        const opPayments = paymentsByOperation[opId] || []
        let paidInSaleCurrency = 0
        for (const p of opPayments) {
          let converted: number
          if (p.currency === saleCurrency) {
            converted = p.amount
          } else if (saleCurrency === "ARS" && p.currency === "USD") {
            converted = p.amount * (p.exchange_rate || rateForOp)
          } else if (saleCurrency === "USD" && p.currency === "ARS") {
            converted = p.amount_usd != null
              ? p.amount_usd
              : p.amount / (p.exchange_rate || rateForOp)
          } else {
            converted = p.amount
          }
          // sign resta las devoluciones (EXPENSE) del aporte neto del cliente.
          paidInSaleCurrency += p.sign * converted
        }

        const debtInSaleCurrency = Math.max(0, saleAmount - paidInSaleCurrency)
        const debtUsd = saleCurrency === "ARS" ? debtInSaleCurrency / rateForOp : debtInSaleCurrency
        const paidUsd = saleCurrency === "ARS" ? paidInSaleCurrency / rateForOp : paidInSaleCurrency

        // Usar USD como moneda principal para deudas
        currency = "USD"

        if (debtUsd > 0) {
          operationsWithDebt.push({
            id: opId,
            file_code: operation.file_code,
            destination: operation.destination || "Sin destino",
            sale_amount_total: saleAmountUsd, // En USD
            currency: "USD",
            paid: paidUsd, // En USD
            debt: debtUsd, // En USD
            departure_date: operation.departure_date,
            seller_id: operation.seller_id || null,
            seller_name: operation.seller_id ? (sellerNamesMap[operation.seller_id] || "Sin vendedor") : null,
          })
          totalDebt += debtUsd
        }
      }

      // Filtro por ID de cliente
      if (customerIdFilter && customer.id !== customerIdFilter) {
        // Si hay filtro de cliente y no coincide, saltar este cliente
        continue
      }

      if (operationsWithDebt.length > 0) {
        debtors.push({
          customer,
          totalDebt,
          currency,
          operationsWithDebt,
        })
      }
    }

    // Sort by total debt (descending)
    debtors.sort((a, b) => b.totalDebt - a.totalDebt)

    return NextResponse.json({ debtors }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }
    })
  } catch (error) {
    console.error("Error in GET /api/accounting/debts-sales:", error)
    return NextResponse.json({ error: "Error al obtener deudores" }, { status: 500 })
  }
}
