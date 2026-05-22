import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("type")
    const status = searchParams.get("status")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")
    const sellerId = searchParams.get("sellerId")
    // BUGFIX: el endpoint ignoraba `limit` y traía TODAS las alerts (miles
    // potencialmente). Default 100, máx 500. La UI nunca muestra más.
    const requestedLimit = parseInt(searchParams.get("limit") || "100", 10)
    const limit = Math.min(Math.max(requestedLimit, 1), 500)

    // Build query
    let query = supabase
      .from("alerts")
      .select(
        `
        *,
        operations:operation_id(
          id,
          destination,
          agency_id,
          seller_id,
          departure_date,
          agencies:agency_id(
            id,
            name
          )
        ),
        customers:customer_id(
          id,
          first_name,
          last_name
        )
      `,
      )
      .order("date_due", { ascending: true })
      .limit(limit)

    // Bug fix 2026-05-15 (P0 cross-tenant): alerts tiene org_id (mig 5
     // backfill 2026-05-10). SIEMPRE filtrar por org_id del user. El bypass
    // viejo "SUPER_ADMIN ve todo" leakeaba alertas cross-tenant.
    const userOrgId = (user as any).org_id as string | null
    if (!userOrgId) {
      return NextResponse.json({ alerts: [] })
    }
    query = query.eq("org_id", userOrgId)

    // Filter by role para SELLERs
    if (user.role === "SELLER") {
      query = query.eq("user_id", user.id)
    }

    // Apply filters
    if (type && type !== "ALL") {
      query = query.eq("type", type)
    }

    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    if (dateFrom) {
      query = query.gte("date_due", dateFrom)
    }

    if (dateTo) {
      query = query.lte("date_due", dateTo)
    }

    if (agencyId && agencyId !== "ALL") {
      // Filter by agency through operations
      let operationsQuery = supabase
        .from("operations")
        .select("id")
        .eq("agency_id", agencyId)

      if (sellerId && sellerId !== "ALL") {
        operationsQuery = operationsQuery.eq("seller_id", sellerId)
      }

      const { data: agencyOperations } = await operationsQuery

      const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)

      if (agencyOperationIds.length > 0) {
        query = query.in("operation_id", agencyOperationIds)
      } else {
        return NextResponse.json({ alerts: [] })
      }
    } else if (sellerId && sellerId !== "ALL") {
      // Filter by seller through operations
      const { data: sellerOperations } = await supabase
        .from("operations")
        .select("id")
        .eq("seller_id", sellerId)

      const sellerOperationIds = (sellerOperations || []).map((op: any) => op.id)

      if (sellerOperationIds.length > 0) {
        query = query.in("operation_id", sellerOperationIds)
      } else {
        return NextResponse.json({ alerts: [] })
      }
    }

    const { data: alerts, error } = await query

    if (error) {
      console.error("Error fetching alerts:", error)
      return NextResponse.json({ error: "Error al obtener alertas" }, { status: 500 })
    }

    // Obtener mensajes de WhatsApp asociados a las operaciones de las alertas
    const operationIds = (alerts || [])
      .filter((a: any) => a.operation_id)
      .map((a: any) => a.operation_id)
      .filter((id: string, index: number, self: string[]) => self.indexOf(id) === index) // Únicos

    let messagesByOperation: Record<string, any[]> = {}
    if (operationIds.length > 0) {
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("id, message, whatsapp_link, status, scheduled_for, phone, customer_name, operation_id")
        .in("operation_id", operationIds)
        .eq("channel", "WHATSAPP")
        .eq("status", "PENDING")
        .limit(1000)

      if (messages) {
        const typedMessages = messages as Array<{
          id: string
          message: string
          whatsapp_link: string
          status: string
          scheduled_for: string
          phone: string | null
          customer_name: string
          operation_id: string | null
        }>
        
        for (const msg of typedMessages) {
          if (msg.operation_id) {
            if (!messagesByOperation[msg.operation_id]) {
              messagesByOperation[msg.operation_id] = []
            }
            messagesByOperation[msg.operation_id].push(msg)
          }
        }
      }
    }

    // Agregar mensajes a cada alerta
    const alertsWithMessages = (alerts || []).map((alert: any) => ({
      ...alert,
      whatsapp_messages: alert.operation_id ? (messagesByOperation[alert.operation_id] || []) : [],
    }))

    return NextResponse.json({ alerts: alertsWithMessages })
  } catch (error) {
    console.error("Error in GET /api/alerts:", error)
    return NextResponse.json({ error: "Error al obtener alertas" }, { status: 500 })
  }
}

