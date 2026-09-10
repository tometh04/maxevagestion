import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  applyAgencyPermissionScope,
  type AgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"

/**
 * De dónde salió una operación: el lead que le dio origen y las cotizaciones
 * que se armaron en el camino (VIB-184).
 *
 * Por qué vive acá y no en la página: la operación no guarda nada de esto en
 * columnas propias. El lead se alcanza por `operations.lead_id` y las
 * cotizaciones por tres vínculos distintos de la tabla `quotations`
 * (`operation_id`, `lead_id`, `customer_id`), así que juntarlas es una regla de
 * dominio —qué cuenta como "origen" y con qué prioridad— y no una query suelta.
 *
 * Diferencia deliberada con `getOperationVisibleDocuments()`: aquel corre con
 * admin client y no filtra `org_id` (se apoya en que los ids ya acotan). Acá NO
 * se repite ese patrón. Todas las queries llevan `org_id` explícito y además el
 * scope por agencia/vendedor, porque este bloque expone datos de CRM dentro de
 * la pantalla de operaciones y el gate de la página no alcanza: quien puede ver
 * una operación no necesariamente puede ver el lead que la originó.
 */

export type OriginQuotationSource = "OPERATION" | "LEAD" | "CUSTOMER"

export interface OriginQuotation {
  id: string
  quotation_number: string
  status: string
  /** Importe tal como lo guarda la cotización; la UI decide si es total o por persona. */
  total_amount: number
  currency: string
  pricing_mode: "PER_PERSON" | "GROUP_TOTAL" | null
  adults: number
  children: number
  infants: number
  destination: string | null
  created_at: string | null
  valid_until: string | null
  /** Token del link público; sin él no hay a dónde mandar al usuario. */
  public_token: string | null
  seller_name: string | null
  /** Por qué vínculo llegó: define el badge y el orden. */
  source: OriginQuotationSource
}

export interface OriginLead {
  id: string
  contact_name: string
  contact_phone: string | null
  contact_email: string | null
  destination: string | null
  region: string | null
  source: string | null
  status: string
  notes: string | null
  quoted_price: number | null
  created_at: string | null
  seller_name: string | null
}

export interface OperationOrigin {
  lead: OriginLead | null
  quotations: OriginQuotation[]
}

const EMPTY_ORIGIN: OperationOrigin = { lead: null, quotations: [] }

const QUOTATION_COLUMNS = `
  id, quotation_number, status, total_amount, currency, pricing_mode,
  adults, children, infants, destination, created_at, valid_until, public_token,
  seller:seller_id ( id, name )
`

/**
 * Prioridad de vínculo. Una misma cotización puede llegar por más de un camino
 * (la que se convirtió en esta operación tiene `operation_id` y `lead_id`); gana
 * el vínculo más específico, que es el que describe mejor de dónde salió.
 */
const SOURCE_RANK: Record<OriginQuotationSource, number> = {
  OPERATION: 0,
  LEAD: 1,
  CUSTOMER: 2,
}

function mapQuotation(row: any, source: OriginQuotationSource): OriginQuotation {
  return {
    id: row.id,
    quotation_number: row.quotation_number,
    status: row.status,
    total_amount: Number(row.total_amount) || 0,
    currency: row.currency || "USD",
    pricing_mode: row.pricing_mode === "PER_PERSON" || row.pricing_mode === "GROUP_TOTAL"
      ? row.pricing_mode
      : null,
    adults: Number(row.adults) || 0,
    children: Number(row.children) || 0,
    infants: Number(row.infants) || 0,
    destination: row.destination ?? null,
    created_at: row.created_at ?? null,
    valid_until: row.valid_until ?? null,
    public_token: row.public_token ?? null,
    seller_name: row.seller?.name ?? null,
    source,
  }
}

export interface FetchOperationOriginArgs {
  orgId: string
  operationId: string
  leadId?: string | null
  /** Clientes vinculados a la operación; puede haber varios. */
  customerIds?: string[]
  /**
   * Alcance resuelto para `leads` / `read`. Si el usuario no tiene ninguna
   * agencia habilitada —un asesor independiente, por ejemplo— no se consulta
   * nada: el bloque entero es dato de CRM.
   */
  scope: AgencyPermissionScope
}

/**
 * Lead de origen + cotizaciones visibles para este usuario.
 *
 * Se hace una query por vínculo en vez de un `.or()` gigante a propósito: el
 * scope por agencia ya usa `.or()` internamente y encadenar dos vuelve el
 * predicado difícil de auditar. Tres queries chicas y acotadas por id se leen
 * mejor y siguen el mismo patrón que el helper de documentos.
 */
export async function fetchOperationOrigin(
  supabase: SupabaseClient<Database>,
  { orgId, operationId, leadId, customerIds = [], scope }: FetchOperationOriginArgs
): Promise<OperationOrigin> {
  if (!orgId) return EMPTY_ORIGIN
  // Sin agencias habilitadas para leer leads no hay nada que mostrar. Cortar
  // acá evita mandar queries que igual volverían vacías por el UUID imposible.
  if (scope.agencyIds.length === 0) return EMPTY_ORIGIN

  const scoped = (query: any) =>
    applyAgencyPermissionScope(query.eq("org_id", orgId), scope)

  const byId = new Map<string, OriginQuotation>()

  const collect = async (
    build: (query: any) => any,
    source: OriginQuotationSource,
    label: string
  ) => {
    const { data, error } = await build(
      scoped((supabase.from("quotations") as any).select(QUOTATION_COLUMNS))
    ).order("created_at", { ascending: false })

    // Que falte una de las tres fuentes no puede tumbar el detalle de la
    // operación: se registra y se sigue con las demás.
    if (error) {
      console.error(`[operation-origin] no se pudieron leer las cotizaciones ${label}:`, error)
      return
    }

    for (const row of (data || []) as any[]) {
      const existing = byId.get(row.id)
      if (existing && SOURCE_RANK[existing.source] <= SOURCE_RANK[source]) continue
      byId.set(row.id, mapQuotation(row, source))
    }
  }

  await collect((query) => query.eq("operation_id", operationId), "OPERATION", "de la operación")

  if (leadId) {
    await collect((query) => query.eq("lead_id", leadId), "LEAD", "del lead")
  }

  const uniqueCustomerIds = Array.from(new Set(customerIds.filter(Boolean)))
  if (uniqueCustomerIds.length > 0) {
    await collect((query) => query.in("customer_id", uniqueCustomerIds), "CUSTOMER", "del cliente")
  }

  const quotations = Array.from(byId.values()).sort((left, right) => {
    const byRank = SOURCE_RANK[left.source] - SOURCE_RANK[right.source]
    if (byRank !== 0) return byRank
    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  })

  const lead = leadId ? await fetchOriginLead(supabase, orgId, leadId, scope) : null

  return { lead, quotations }
}

async function fetchOriginLead(
  supabase: SupabaseClient<Database>,
  orgId: string,
  leadId: string,
  scope: AgencyPermissionScope
): Promise<OriginLead | null> {
  // El vendedor del lead vive en `assigned_seller_id`, no en `seller_id`: sin
  // avisarle al helper, un usuario "sólo mis datos" filtraría por una columna
  // que no existe en esta tabla.
  const { data, error } = await applyAgencyPermissionScope(
    (supabase.from("leads") as any)
      .select(
        `
        id, contact_name, contact_phone, contact_email, destination, region,
        source, status, notes, quoted_price, created_at,
        seller:assigned_seller_id ( id, name )
      `
      )
      .eq("org_id", orgId)
      .eq("id", leadId),
    scope,
    { sellerColumn: "assigned_seller_id" }
  ).maybeSingle()

  if (error) {
    console.error("[operation-origin] no se pudo leer el lead de origen:", error)
    return null
  }
  if (!data) return null

  return {
    id: data.id,
    contact_name: data.contact_name,
    contact_phone: data.contact_phone ?? null,
    contact_email: data.contact_email ?? null,
    destination: data.destination ?? null,
    region: data.region ?? null,
    source: data.source ?? null,
    status: data.status,
    notes: data.notes ?? null,
    quoted_price: data.quoted_price === null || data.quoted_price === undefined
      ? null
      : Number(data.quoted_price),
    created_at: data.created_at ?? null,
    seller_name: data.seller?.name ?? null,
  }
}
