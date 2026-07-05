import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // 🔴 Fix cross-tenant CRÍTICO (2026-05-18, sweep /reports/*): defense-in-depth
    // RLS no está protegiendo confiablemente; agregamos .eq("org_id", user.org_id)
    // explícito a TODAS las queries de tablas con org_id (operations, customers,
    // payments).
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const reportType = searchParams.get("type") || "operations"
    const exportFormat = searchParams.get("format") || "csv"
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")

    // Obtener agencias del usuario
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    let data: any[] = []
    let columns: { key: string; label: string }[] = []

    switch (reportType) {
      case "operations": {
        // RLS + filtro explícito (defense-in-depth)
        let query = (supabase.from("operations") as any)
          .select(`
            *,
            sellers:seller_id (name),
            operators:operator_id (name),
            agencies:agency_id (name)
          `)
          .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
          .order("departure_date", { ascending: false })

        if (dateFrom) query = query.gte("departure_date", dateFrom)
        if (dateTo) query = query.lte("departure_date", dateTo)
        if (agencyId && agencyId !== "ALL") {
          query = query.eq("agency_id", agencyId)
        } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
          query = query.in("agency_id", agencyIds)
        }

        const { data: ops } = await query.limit(1000)

        // Servicios adicionales (operation_services): si la flag está ON, sumamos
        // su venta a sale_amount_total para que la venta_total exportada refleje
        // también los servicios extra vendidos al cliente.
        const includeServices = await getOrgFeatureFlag(
          supabase, user.org_id, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
        )
        const opsList = (ops || []).map((op: any) => ({
          id: op.id, sale_currency: op.sale_currency, currency: op.currency,
        }))
        const serviceExtras = includeServices && opsList.length > 0
          ? await getServiceExtrasByOperation(supabase, opsList, user.org_id)
          : {}

        data = (ops || []).map((op: any) => ({
          fecha_salida: op.departure_date ? format(new Date(op.departure_date), "dd/MM/yyyy") : "",
          destino: op.destination || "",
          tipo: op.type || "",
          estado: op.status || "",
          adultos: op.adults || 0,
          menores: op.children || 0,
          venta_total: (Number(op.sale_amount_total) || 0) + ((serviceExtras as any)[op.id]?.saleExtra || 0),
          costo_operador: op.operator_cost || 0,
          margen: op.margin_amount || 0,
          moneda: op.currency || "ARS",
          vendedor: op.sellers?.name || "",
          operador: op.operators?.name || "",
          agencia: op.agencies?.name || "",
        }))

        columns = [
          { key: "fecha_salida", label: "Fecha Salida" },
          { key: "destino", label: "Destino" },
          { key: "tipo", label: "Tipo" },
          { key: "estado", label: "Estado" },
          { key: "adultos", label: "Adultos" },
          { key: "menores", label: "Menores" },
          { key: "venta_total", label: "Venta Total" },
          { key: "costo_operador", label: "Costo Operador" },
          { key: "margen", label: "Margen" },
          { key: "moneda", label: "Moneda" },
          { key: "vendedor", label: "Vendedor" },
          { key: "operador", label: "Operador" },
          { key: "agencia", label: "Agencia" },
        ]
        break
      }

      case "customers": {
        // RLS + filtro explícito (defense-in-depth)
        let query = (supabase.from("customers") as any)
          .select(`*, agencies:agency_id (name)`)
          .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
          .order("created_at", { ascending: false })

        if (agencyId && agencyId !== "ALL") {
          query = query.eq("agency_id", agencyId)
        } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
          query = query.in("agency_id", agencyIds)
        }

        const { data: customers } = await query.limit(1000)
        data = (customers || []).map((c: any) => ({
          nombre: c.first_name || "",
          apellido: c.last_name || "",
          email: c.email || "",
          telefono: c.phone || "",
          documento: `${c.document_type || ""} ${c.document_number || ""}`.trim(),
          nacionalidad: c.nationality || "",
          fecha_alta: c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "",
          agencia: c.agencies?.name || "",
        }))

        columns = [
          { key: "nombre", label: "Nombre" },
          { key: "apellido", label: "Apellido" },
          { key: "email", label: "Email" },
          { key: "telefono", label: "Teléfono" },
          { key: "documento", label: "Documento" },
          { key: "nacionalidad", label: "Nacionalidad" },
          { key: "fecha_alta", label: "Fecha Alta" },
          { key: "agencia", label: "Agencia" },
        ]
        break
      }

      case "payments": {
        // Multi-tenant: scope por agencias del user (excepto SUPER_ADMIN sin restricciones historicas).
        // payments.operation_id → operations.agency_id. Si no hay agencyIds, solo SELLER con seller_id.
        let agencyScopedOpIds: string[] | null = null
        const effectiveAgencyIds =
          agencyId && agencyId !== "ALL"
            ? [agencyId]
            : user.role !== "SUPER_ADMIN"
              ? agencyIds
              : null

        if (effectiveAgencyIds && effectiveAgencyIds.length > 0) {
          // Traer op ids acotados a agencias del user (chunked por si son muchos)
          // RLS + filtro explícito (defense-in-depth)
          agencyScopedOpIds = []
          const chunkSize = 200
          for (let i = 0; i < effectiveAgencyIds.length; i += chunkSize) {
            const chunk = effectiveAgencyIds.slice(i, i + chunkSize)
            const { data: ops } = await (supabase.from("operations") as any)
              .select("id")
              .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
              .in("agency_id", chunk)
            if (ops) agencyScopedOpIds.push(...ops.map((o: any) => o.id))
          }
          // Si el user no tiene agencias, no debe ver ningun pago
          if (agencyScopedOpIds.length === 0) {
            data = []
            columns = []
            break
          }
        }

        // RLS + filtro explícito (defense-in-depth)
        let query = (supabase.from("payments") as any)
          .select(`
            *,
            operations:operation_id (destination, agencies:agency_id (name))
          `)
          .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
          .neq("source", "OPERATOR_BULK")
          .order("date_due", { ascending: false })

        if (dateFrom) query = query.gte("date_due", dateFrom)
        if (dateTo) query = query.lte("date_due", dateTo)

        // Aplicar scope de agencia via operation_id (chunked si hace falta)
        if (agencyScopedOpIds && agencyScopedOpIds.length > 0) {
          // Con muchos op ids, chunkeamos la consulta de payments tambien
          const chunkSize = 200
          const allPayments: any[] = []
          for (let i = 0; i < agencyScopedOpIds.length; i += chunkSize) {
            const chunkIds = agencyScopedOpIds.slice(i, i + chunkSize)
            // RLS + filtro explícito (defense-in-depth)
            let chunkQuery = (supabase.from("payments") as any)
              .select(`*, operations:operation_id (destination, agencies:agency_id (name))`)
              .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
              .neq("source", "OPERATOR_BULK")
              .in("operation_id", chunkIds)
              .order("date_due", { ascending: false })
            if (dateFrom) chunkQuery = chunkQuery.gte("date_due", dateFrom)
            if (dateTo) chunkQuery = chunkQuery.lte("date_due", dateTo)
            const { data: chunkPayments } = await chunkQuery.limit(1000)
            if (chunkPayments) allPayments.push(...chunkPayments)
          }
          // SELLER: restringir a sus propias operaciones
          const filteredByRole = user.role === "SELLER"
            ? allPayments.filter((p: any) => p.seller_id === user.id || p.operations?.seller_id === user.id)
            : allPayments
          data = filteredByRole.slice(0, 1000).map((p: any) => ({
            fecha_vencimiento: p.date_due ? format(new Date(p.date_due), "dd/MM/yyyy") : "",
            fecha_pago: p.date_paid ? format(new Date(p.date_paid), "dd/MM/yyyy") : "",
            monto: p.amount || 0,
            moneda: p.currency || "ARS",
            estado: p.status || "",
            metodo: p.method || "",
            tipo: p.payer_type || "",
            direccion: p.direction || "",
            operacion: p.operations?.destination || "",
            referencia: p.reference || "",
          }))
          columns = [
            { key: "fecha_vencimiento", label: "Fecha Vencimiento" },
            { key: "fecha_pago", label: "Fecha Pago" },
            { key: "monto", label: "Monto" },
            { key: "moneda", label: "Moneda" },
            { key: "estado", label: "Estado" },
            { key: "metodo", label: "Método" },
            { key: "tipo", label: "Tipo" },
            { key: "direccion", label: "Dirección" },
            { key: "operacion", label: "Operación" },
            { key: "referencia", label: "Referencia" },
          ]
          break
        }

        const { data: payments } = await query.limit(1000)
        data = (payments || []).map((p: any) => ({
          fecha_vencimiento: p.date_due ? format(new Date(p.date_due), "dd/MM/yyyy") : "",
          fecha_pago: p.date_paid ? format(new Date(p.date_paid), "dd/MM/yyyy") : "",
          monto: p.amount || 0,
          moneda: p.currency || "ARS",
          estado: p.status || "",
          metodo: p.method || "",
          tipo: p.payer_type || "",
          direccion: p.direction || "",
          operacion: p.operations?.destination || "",
          referencia: p.reference || "",
        }))

        columns = [
          { key: "fecha_vencimiento", label: "Fecha Vencimiento" },
          { key: "fecha_pago", label: "Fecha Pago" },
          { key: "monto", label: "Monto" },
          { key: "moneda", label: "Moneda" },
          { key: "estado", label: "Estado" },
          { key: "metodo", label: "Método" },
          { key: "tipo", label: "Tipo" },
          { key: "direccion", label: "Dirección" },
          { key: "operacion", label: "Operación" },
          { key: "referencia", label: "Referencia" },
        ]
        break
      }

      default:
        return NextResponse.json({ error: "Tipo de reporte no soportado" }, { status: 400 })
    }

    // Generar según formato
    switch (exportFormat) {
      case "csv": {
        const csvContent = generateCSV(data, columns)
        return new NextResponse(csvContent, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${reportType}-${format(new Date(), "yyyy-MM-dd")}.csv"`,
          },
        })
      }

      case "json": {
        return NextResponse.json({ data, columns })
      }

      default:
        return NextResponse.json({ error: "Formato no soportado" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("Error exporting report:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateCSV(data: any[], columns: { key: string; label: string }[]): string {
  // Header
  const header = columns.map(c => `"${c.label}"`).join(",")
  
  // Rows
  const rows = data.map(row => 
    columns.map(col => {
      const value = row[col.key]
      if (typeof value === "string") {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value ?? ""
    }).join(",")
  )

  // BOM for Excel UTF-8 compatibility
  const BOM = "\uFEFF"
  return BOM + header + "\n" + rows.join("\n")
}
