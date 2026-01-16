import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { applyLeadsFilters } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const searchTerm = `%${query}%`
    const results: Array<{
      id: string
      type: string
      title: string
      subtitle?: string
    }> = []

    // Obtener agencias del usuario para filtrar
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Paralelizar todas las búsquedas
    const searchPromises = []

    // Buscar clientes (buscar por nombre completo, email y teléfono)
    const customerQuery = (supabase.from("customers") as any)
      .select("id, first_name, last_name, email, phone")
      .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`)
      .limit(5)
    
    searchPromises.push(
      customerQuery
        .then((r: any) => ({ type: 'customers', data: r.data, error: r.error }))
        .catch((err: any) => ({ type: 'customers', data: null, error: err }))
    )

    // Buscar operaciones (por código, destino, códigos de reserva)
    let operationQuery = (supabase.from("operations") as any)
      .select("id, file_code, destination, status, agency_id, reservation_code_air, reservation_code_hotel")
      .or(`file_code.ilike.${searchTerm},destination.ilike.${searchTerm},reservation_code_air.ilike.${searchTerm},reservation_code_hotel.ilike.${searchTerm}`)
      .limit(5)
    
    // Aplicar filtros de permisos para operaciones
    if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      operationQuery = operationQuery.in("agency_id", agencyIds)
    } else if (user.role === "SELLER") {
      operationQuery = operationQuery.eq("seller_id", user.id)
    }
    
    searchPromises.push(
      operationQuery
        .then((r: any) => ({ type: 'operations', data: r.data, error: r.error }))
        .catch((err: any) => ({ type: 'operations', data: null, error: err }))
    )

    // Buscar operadores
    const operatorQuery = (supabase.from("operators") as any)
      .select("id, name, contact_email")
      .or(`name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`)
      .limit(5)
    
    searchPromises.push(
      operatorQuery
        .then((r: any) => ({ type: 'operators', data: r.data, error: r.error }))
        .catch((err: any) => ({ type: 'operators', data: null, error: err }))
    )

    // Buscar leads (con filtros de permisos)
    let leadQuery = (supabase.from("leads") as any)
      .select("id, contact_name, destination, status, agency_id, assigned_seller_id")
      .or(`contact_name.ilike.${searchTerm},destination.ilike.${searchTerm}`)
      .limit(5)
    
    // Aplicar filtros de permisos para leads
    try {
      leadQuery = applyLeadsFilters(leadQuery, user, agencyIds)
    } catch {
      // Si falla el filtro, solo buscar leads del usuario
      if (user.role === "SELLER") {
        leadQuery = leadQuery.eq("assigned_seller_id", user.id)
      } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
        leadQuery = leadQuery.in("agency_id", agencyIds)
      }
    }
    
    searchPromises.push(
      leadQuery
        .then((r: any) => ({ type: 'leads', data: r.data, error: r.error }))
        .catch((err: any) => ({ type: 'leads', data: null, error: err }))
    )

    // Ejecutar todas las búsquedas en paralelo
    const searchResults = await Promise.all(searchPromises)

    // Procesar resultados
    searchResults.forEach((result: any) => {
      if (result.error) {
        console.error(`Error in ${result.type} search:`, result.error)
        return
      }

      if (result.type === 'customers' && result.data) {
        result.data.forEach((c: any) => {
          results.push({
            id: c.id,
            type: "customer",
            title: `${c.first_name} ${c.last_name}`,
            subtitle: c.email || c.phone || "Sin contacto",
          })
        })
      } else if (result.type === 'operations' && result.data) {
        const statusLabels: Record<string, string> = {
          PRE_RESERVATION: "Pre-reserva",
          RESERVED: "Reservado",
          CONFIRMED: "Confirmado",
          CANCELLED: "Cancelado",
          TRAVELLED: "Viajado",
          CLOSED: "Cerrado",
        }
        result.data.forEach((o: any) => {
          // Determinar qué mostramos en el título según qué coincidió
          const queryLower = query.toLowerCase()
          let title = o.file_code || o.destination || "Sin código"
          
          // Si el código de búsqueda coincide con un código de reserva, mostrarlo primero
          if (o.reservation_code_air && o.reservation_code_air.toLowerCase().includes(queryLower)) {
            title = `Cod. Aéreo: ${o.reservation_code_air}`
          } else if (o.reservation_code_hotel && o.reservation_code_hotel.toLowerCase().includes(queryLower)) {
            title = `Cod. Hotel: ${o.reservation_code_hotel}`
          }
          
          const subtitleParts = []
          if (o.destination) subtitleParts.push(o.destination)
          if (o.reservation_code_air) subtitleParts.push(`Rva Aéreo: ${o.reservation_code_air}`)
          if (o.reservation_code_hotel) subtitleParts.push(`Rva Hotel: ${o.reservation_code_hotel}`)
          subtitleParts.push(statusLabels[o.status] || o.status)
          
          results.push({
            id: o.id,
            type: "operation",
            title: title,
            subtitle: subtitleParts.join(" - "),
          })
        })
      } else if (result.type === 'operators' && result.data) {
        result.data.forEach((op: any) => {
          results.push({
            id: op.id,
            type: "operator",
            title: op.name,
            subtitle: op.contact_email || "Sin email",
          })
        })
      } else if (result.type === 'leads' && result.data) {
        const statusLabels: Record<string, string> = {
          NEW: "Nuevo",
          IN_PROGRESS: "En Progreso",
          QUOTED: "Cotizado",
          WON: "Ganado",
          LOST: "Perdido",
        }
        result.data.forEach((l: any) => {
          results.push({
            id: l.id,
            type: "lead",
            title: l.contact_name || "Sin nombre",
            subtitle: `${l.destination || "Sin destino"} - ${statusLabels[l.status] || l.status}`,
          })
        })
      }
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Error in search:", error)
    return NextResponse.json({ results: [] })
  }
}

