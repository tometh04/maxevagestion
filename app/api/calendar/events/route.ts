import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { isOwnDataOnlyResolved } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user, supabase, agencyIds, matrix } = await getRequestPermissions()
    const events: any[] = []

    // Scope "solo lo propio" resuelto contra el matrix dinámico por agencia.
    // Antes esto era `role === "SELLER"` fijo, así que apagar ownDataOnly en la
    // matriz no tenía efecto (un vendedor no podía ver todas las operaciones).
    const opsOwnData = isOwnDataOnlyResolved(user, "operations", matrix ?? undefined)
    const leadsOwnData = isOwnDataOnlyResolved(user, "leads", matrix ?? undefined)

    // ────────────────────────────────────────────────────────────
    // Bug fix 2026-05-15 (reportado por Lozada Gualeguaychú):
    // El código anterior tenía un bypass `isSuperAdmin = no filtrar nada`,
    // que en el modelo SaaS multi-tenant le leakeaba operaciones/pagos/
    // alertas/leads de TODOS los tenants a cualquier SUPER_ADMIN.
    //
    // En el modelo SaaS: SUPER_ADMIN es el owner de SU org, no platform
    // admin de Vibook. getUserAgencyIds ya devuelve solo las agencias de
    // su org (scopeado por users.org_id). Filtrar siempre por esa lista.
    //
    // Si agencyIds está vacío (user huérfano sin agencias) → devolver
    // events vacío. Fail-safe vs leak.
    // ────────────────────────────────────────────────────────────
    if (!opsOwnData && agencyIds.length === 0) {
      return NextResponse.json({ events: [] })
    }

    // --- Helper to apply role-based filters to an operations query ---
    const applyOperationFilters = (query: any) => {
      if (opsOwnData) {
        return query.eq("seller_id", user.id)
      }
      // SUPER_ADMIN, ADMIN, CONTABLE, VIEWER: filtrar por las agencias de su org
      return query.in("agency_id", agencyIds)
    }

    // Check-ins de operaciones
    let checkinsQuery = (supabase.from("operations") as any)
      .select("id, destination, checkin_date, file_code, seller_id, agency_id")
      .not("checkin_date", "is", null)
    checkinsQuery = applyOperationFilters(checkinsQuery)
    const { data: checkins } = await checkinsQuery

    // Salidas de operaciones (vuelos) y check-in/check-out de hoteles
    // Para product_type HOTEL/CRUCERO: departure_date = check-in, checkout_date = check-out
    let departuresQuery = (supabase.from("operations") as any)
      .select("id, destination, departure_date, return_date, checkout_date, product_type, file_code, seller_id, agency_id")
      .not("departure_date", "is", null)
    departuresQuery = applyOperationFilters(departuresQuery)
    const { data: departures } = await departuresQuery

    // ────────────────────────────────────────────────────────────
    // Titular (cliente MAIN) por operación → identifica la reserva en el
    // calendario, igual que el aviso de check-in (lib/alerts/checkin-alerts.ts).
    // Dos reservas al mismo destino/fecha se veían idénticas ("Salida: Madrid").
    // Se resuelve en tiempo de lectura, así aplica a todas las ops (viejas y nuevas).
    // Formato "Apellido, Nombre". Batch por los op ids ya scopeados arriba.
    // ────────────────────────────────────────────────────────────
    const titularByOp = new Map<string, string>()
    // Carga (batch) los titulares de las op ids que todavía no resolvimos.
    // Idempotente: se puede llamar varias veces; solo busca lo que falta.
    const loadTitulars = async (ids: (string | null | undefined)[]) => {
      const missing = Array.from(
        new Set(ids.filter((id): id is string => !!id && !titularByOp.has(id)))
      )
      if (missing.length === 0) return
      const { data: ocRows } = await (supabase.from("operation_customers") as any)
        .select("operation_id, role, customers:customer_id(first_name, last_name)")
        .in("operation_id", missing)
      const rowsByOp = new Map<string, any[]>()
      for (const row of (ocRows || []) as any[]) {
        const arr = rowsByOp.get(row.operation_id) ?? []
        arr.push(row)
        rowsByOp.set(row.operation_id, arr)
      }
      rowsByOp.forEach((rows, opId) => {
        const main = rows.find((r: any) => r.role === "MAIN") ?? rows[0]
        const c = main?.customers
        const name = c ? [c.last_name, c.first_name].filter(Boolean).join(", ") : ""
        if (name) titularByOp.set(opId, name)
      })
    }

    await loadTitulars([
      ...(checkins || []).map((op: any) => op.id),
      ...(departures || []).map((op: any) => op.id),
    ])

    // Sufijo " — Apellido, Nombre" si la op tiene titular; string vacío si no.
    const titularSuffix = (opId: string): string => {
      const titular = titularByOp.get(opId)
      return titular ? ` — ${titular}` : ""
    }

    if (checkins) {
      for (const op of checkins) {
        events.push({
          id: `checkin-${op.id}`,
          type: "CHECKIN",
          title: `Check-in: ${op.destination}${titularSuffix(op.id)}`,
          date: op.checkin_date,
          description: op.file_code || undefined,
          color: "#4F5BD5",
          operationId: op.id,
        })
      }
    }

    const hotelTypes = new Set(["HOTEL", "CRUCERO"])

    if (departures) {
      for (const op of departures) {
        const isHotel = hotelTypes.has(op.product_type)
        const titular = titularSuffix(op.id)

        if (isHotel) {
          // Check-in del hotel (desde departure_date)
          events.push({
            id: `departure-${op.id}`,
            type: "CHECKIN",
            title: `Check-in: ${op.destination}${titular}`,
            date: op.departure_date,
            description: op.file_code || undefined,
            color: "#4F5BD5",
            operationId: op.id,
          })
          // Check-out del hotel
          if (op.checkout_date) {
            events.push({
              id: `checkout-${op.id}`,
              type: "CHECKOUT",
              title: `Check-out: ${op.destination}${titular}`,
              date: op.checkout_date,
              description: op.file_code || undefined,
              color: "#8B82E8",
              operationId: op.id,
            })
          }
        } else {
          events.push({
            id: `departure-${op.id}`,
            type: "DEPARTURE",
            title: `Salida: ${op.destination}${titular}`,
            date: op.departure_date,
            description: op.file_code || undefined,
            color: "#2CA77F",
            operationId: op.id,
          })
          // Regreso del viaje (vuelo/paquete) desde return_date.
          // HOTEL/CRUCERO ya cubren la vuelta con el Check-out (checkout_date).
          if (op.return_date) {
            events.push({
              id: `return-${op.id}`,
              type: "RETURN",
              title: `Regreso: ${op.destination}${titular}`,
              date: op.return_date,
              description: op.file_code || undefined,
              color: "#0EA5E9",
              operationId: op.id,
            })
          }
        }
      }
    }

    // ────────────────────────────────────────────────────────────
    // Tramos del viaje (operation_legs): un viaje con varios vuelos tenía un
    // único "Salida" en el calendario. Cada tramo aporta su propio evento, con
    // su destino y su código de reserva — que es el dato con el que post venta
    // hace el check-in.
    // ────────────────────────────────────────────────────────────
    // Clave de lo ya emitido a nivel operación, para no duplicar cuando un
    // tramo cae el mismo día que la salida/regreso principal.
    const emittedEventKeys = new Set(
      events.map((event: any) => `${event.operationId}|${event.type}|${event.date}`)
    )

    // operation_legs no tiene seller_id, así que no se puede aplicar el filtro
    // por rol directo: scopeamos por las operaciones visibles para el usuario.
    let allowedOpsForLegs = (supabase.from("operations") as any).select("id, destination, file_code")
    allowedOpsForLegs = applyOperationFilters(allowedOpsForLegs)
    const { data: allowedOpsRows } = await allowedOpsForLegs
    const opById = new Map<string, any>(
      (allowedOpsRows || []).map((op: any) => [op.id, op])
    )

    if (opById.size > 0) {
      const { data: legRows } = await (supabase.from("operation_legs") as any)
        .select("operation_id, order_index, destination, departure_date, reservation_code_air, hotel_name, checkin_date, checkout_date")
        .in("operation_id", Array.from(opById.keys()))
        .order("order_index")

      // Los titulares se cargaron para checkins+departures; una operación
      // alcanzada sólo por un tramo todavía no está. loadTitulars es idempotente
      // y sólo busca lo que falta.
      await loadTitulars((legRows || []).map((leg: any) => leg.operation_id))

      const legIndexByOp = new Map<string, number>()

      for (const leg of (legRows || []) as any[]) {
        const op = opById.get(leg.operation_id)
        if (!op) continue

        // Número de tramo visible = posición dentro de su operación (1-based).
        const legNumber = (legIndexByOp.get(leg.operation_id) ?? 0) + 1
        legIndexByOp.set(leg.operation_id, legNumber)

        const titular = titularSuffix(op.id)
        const destination = leg.destination || op.destination
        const codeFragment = leg.reservation_code_air ? ` · ${leg.reservation_code_air}` : ""
        const description = [op.file_code, leg.reservation_code_air].filter(Boolean).join(" · ") || undefined

        const pushLegEvent = (
          type: string,
          date: string | null,
          label: string,
          color: string,
          idPrefix: string,
          suffix = ""
        ) => {
          if (!date) return
          const key = `${op.id}|${type}|${date}`
          if (emittedEventKeys.has(key)) return
          emittedEventKeys.add(key)
          events.push({
            id: `${idPrefix}-${leg.operation_id}-${leg.order_index ?? legNumber}`,
            type,
            title: `${label} Tramo ${legNumber}: ${destination}${titular}${suffix}`,
            date,
            description,
            color,
            operationId: op.id,
          })
        }

        // El vuelo del tramo lleva el código aéreo; el hotel lleva su nombre.
        // Sin esto, un vuelo y un check-in de hotel el mismo día (lo normal:
        // llegás y entrás al hotel) se veían como dos eventos idénticos.
        const hotelFragment = leg.hotel_name ? ` · ${leg.hotel_name}` : ""

        pushLegEvent("DEPARTURE", leg.departure_date, "Salida", "#2CA77F", "leg-departure", codeFragment)
        // checkin_date / checkout_date del tramo son del hotel de ese tramo.
        pushLegEvent("CHECKIN", leg.checkin_date, "Check-in", "#4F5BD5", "leg-checkin", hotelFragment)
        pushLegEvent("CHECKOUT", leg.checkout_date, "Check-out", "#8B82E8", "leg-checkout", hotelFragment)
      }
    }

    // Vencimientos de pagos — siempre filtrar por allowedOps de la org
    let opsForPayments = (supabase.from("operations") as any).select("id")
    opsForPayments = applyOperationFilters(opsForPayments)
    const { data: allowedOpsPayments } = await opsForPayments
    const allowedOpIdsForPayments = (allowedOpsPayments || []).map((op: any) => op.id)

    if (allowedOpIdsForPayments.length > 0) {
      const { data: payments } = await (supabase.from("payments") as any)
        .select("id, amount, currency, date_due, payer_type, operation_id, operations:operation_id(destination)")
        .eq("status", "PENDING")
        .in("operation_id", allowedOpIdsForPayments)

      if (payments) {
        for (const payment of payments) {
          events.push({
            id: `payment-${payment.id}`,
            type: "PAYMENT_DUE",
            title: `Pago ${payment.payer_type === "CUSTOMER" ? "de cliente" : "a operador"}: ${Number(payment.amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payment.currency}`,
            date: payment.date_due,
            description: payment.operations?.destination || undefined,
            color: "#EC7B5F",
            operationId: payment.operation_id,
          })
        }
      }
    }

    // Seguimientos de leads — filtrar por agencias de la org
    let leadsQuery = (supabase.from("leads") as any)
      .select("id, contact_name, destination, follow_up_date, assigned_seller_id, agency_id")
      .not("follow_up_date", "is", null)

    if (leadsOwnData) {
      leadsQuery = leadsQuery.eq("assigned_seller_id", user.id)
    } else {
      leadsQuery = leadsQuery.in("agency_id", agencyIds)
    }

    const { data: leads } = await leadsQuery

    if (leads) {
      for (const lead of leads) {
        events.push({
          id: `followup-${lead.id}`,
          type: "FOLLOW_UP",
          title: `Seguimiento: ${lead.contact_name}`,
          date: lead.follow_up_date,
          description: lead.destination || undefined,
          color: "#8B82E8",
          leadId: lead.id,
        })
      }
    }

    // Alertas pendientes — siempre filtrar por allowedOps de la org
    let opsForAlerts = (supabase.from("operations") as any).select("id")
    opsForAlerts = applyOperationFilters(opsForAlerts)
    const { data: allowedOpsAlerts } = await opsForAlerts
    const allowedOpIdsForAlerts = (allowedOpsAlerts || []).map((op: any) => op.id)

    if (allowedOpIdsForAlerts.length > 0) {
      const { data: alerts } = await (supabase.from("alerts") as any)
        .select("id, description, date_due, type, operation_id")
        .eq("status", "PENDING")
        .in("operation_id", allowedOpIdsForAlerts)

      if (alerts) {
        // Las alertas guardan su texto al generarse (UPCOMING_TRIP check-in/check-out,
        // etc.) y no incluyen el titular. Lo agregamos en tiempo de lectura sobre la
        // línea secundaria, así el nombre aparece retroactivamente en alertas viejas y
        // nuevas sin tocar el string persistido.
        await loadTitulars((alerts as any[]).map((a: any) => a.operation_id))
        for (const alert of alerts) {
          const titular = alert.operation_id ? titularByOp.get(alert.operation_id) : undefined
          events.push({
            id: `alert-${alert.id}`,
            type: "REMINDER",
            title: alert.description,
            date: alert.date_due.split("T")[0],
            description: titular ? `Titular: ${titular}` : undefined,
            color: "#4F5BD5",
            operationId: alert.operation_id || undefined,
          })
        }
      }
    }

    return NextResponse.json({ events })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
