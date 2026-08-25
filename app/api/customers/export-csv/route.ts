import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds, applyCustomersFilters, canPerformAction } from "@/lib/permissions-api"
import { resolveLastOperation } from "@/lib/customers/last-operation"
import { buildCsvBody, csvDate, csvDownloadHeaders } from "@/lib/export/csv-excel-es"

/**
 * Export de la cartera de clientes (VIB-153).
 *
 * Yamil lo pidió para recontacto: cada vendedor tiene que poder bajarse su lista
 * de clientes con el último viaje, para llamarlos y venderles algo nuevo.
 *
 * El scope NO se relaja: se aplica `applyCustomersFilters`, el mismo que usa el
 * listado, así que un SELLER exporta su cartera y un asesor independiente sigue
 * sin ver la de la agencia. El filtro por vendedor solo **acota** dentro de lo
 * que el usuario ya podía ver.
 */

/** Tope duro: el export es para trabajar, no para bajarse la base. */
const LIMIT_HARD = 5_000

const HEADERS = [
  "Nombre",
  "Apellido",
  "Teléfono",
  "Email",
  "Documento",
  "Vendedor",
  "Última operación",
  "Último destino",
  "Viajes",
]

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    if (!canPerformAction(user, "customers", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver clientes" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim() ?? ""
    const sellerId = searchParams.get("sellerId")

    let query = supabase.from("customers").select(`
        id,
        first_name,
        last_name,
        phone,
        email,
        document_type,
        document_number,
        operation_customers(
          operations:operation_id(
            operation_date,
            destination,
            seller_id,
            sellers:seller_id(id, name)
          )
        )
      `)

    try {
      const applied = await applyCustomersFilters(query, user, agencyIds, supabase)
      query = applied.query
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Misma búsqueda por palabras que el listado: cada palabra tiene que matchear
    // el MISMO cliente, si no "Maria Belen" trae a cualquier Maria.
    if (search) {
      const words = search.split(/\s+/).filter(Boolean)
      for (const word of words) {
        query = query.or(
          `first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,phone.ilike.%${word}%`
        )
      }
    }

    const { data, error } = await query
      .order("last_name", { ascending: true })
      .limit(LIMIT_HARD)

    if (error) {
      console.error("[customers/export-csv] error:", error)
      return NextResponse.json({ error: "Error al exportar clientes" }, { status: 500 })
    }

    const rows = (data || [])
      .map((customer: any) => ({
        customer,
        lastOperation: resolveLastOperation(customer.operation_customers),
        trips: (customer.operation_customers || []).length,
      }))
      // El filtro por vendedor se aplica acá porque depende de la última
      // operación, que no es una columna de `customers`.
      .filter(({ lastOperation }) =>
        !sellerId || sellerId === "ALL" ? true : lastOperation?.seller_id === sellerId
      )
      .map(({ customer, lastOperation, trips }) => [
        customer.first_name || "",
        customer.last_name || "",
        customer.phone || "",
        customer.email || "",
        [customer.document_type, customer.document_number].filter(Boolean).join(" ") || "",
        lastOperation?.seller_name || "",
        csvDate(lastOperation?.date),
        lastOperation?.destination || "",
        trips,
      ])

    const today = new Date().toISOString().slice(0, 10)
    const truncated = (data || []).length === LIMIT_HARD
    const filename = truncated
      ? `clientes-${today}-TRUNCADO-${LIMIT_HARD}.csv`
      : `clientes-${today}.csv`

    return new NextResponse(buildCsvBody(HEADERS, rows), {
      status: 200,
      headers: csvDownloadHeaders(filename),
    })
  } catch (error: any) {
    console.error("[customers/export-csv] error:", error)
    return NextResponse.json({ error: "Error al exportar clientes" }, { status: 500 })
  }
}
