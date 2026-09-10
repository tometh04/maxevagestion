import { fetchOperationOrigin } from "@/lib/quotations/operation-origin"
import type { AgencyPermissionScope } from "@/lib/permissions/agency-scope-server"

const ORG = "org-1"
const AGENCY = "agency-1"
const OTHER_AGENCY = "agency-2"
const USER = "user-1"

function scopeFull(agencyIds: string[] = [AGENCY]): AgencyPermissionScope {
  return {
    module: "leads",
    permission: "read",
    userId: USER,
    memberAgencyIds: agencyIds,
    agencyIds,
    fullAgencyIds: agencyIds,
    ownAgencyIds: [],
    permissionsByAgency: {},
  }
}

function scopeOwn(agencyIds: string[] = [AGENCY]): AgencyPermissionScope {
  return {
    module: "leads",
    permission: "read",
    userId: USER,
    memberAgencyIds: agencyIds,
    agencyIds,
    fullAgencyIds: [],
    ownAgencyIds: agencyIds,
    permissionsByAgency: {},
  }
}

const scopeBlocked: AgencyPermissionScope = {
  module: "leads",
  permission: "read",
  userId: USER,
  memberAgencyIds: [AGENCY],
  agencyIds: [],
  fullAgencyIds: [],
  ownAgencyIds: [],
  permissionsByAgency: {},
}

type Filter =
  | { kind: "eq"; column: string; value: any }
  | { kind: "in"; column: string; values: any[] }
  | { kind: "or"; expression: string }

/**
 * Cliente falso que aplica de verdad los filtros encadenados sobre arrays en
 * memoria. La gracia es que un `.eq("org_id", ...)` que falte se note: si el
 * helper deja de filtrar, las filas de la otra org aparecen en el resultado.
 */
function createClient(tables: { quotations?: any[]; leads?: any[] }) {
  const calls: Record<string, Filter[][]> = { quotations: [], leads: [] }

  const makeQuery = (table: string) => {
    const rows: any[] = (tables as any)[table] || []
    const filters: Filter[] = []
    calls[table].push(filters)

    const apply = () =>
      rows.filter((row) =>
        filters.every((filter) => {
          if (filter.kind === "eq") return row[filter.column] === filter.value
          if (filter.kind === "in") return filter.values.includes(row[filter.column])
          // Sólo se usa para el predicado mixto de agencias; alcanza con
          // reconocer las dos formas que emite applyAgencyPermissionScope.
          const [, fullList] = filter.expression.match(/^agency_id\.in\.\(([^)]*)\)/) || []
          const [, ownList, ownSeller] =
            filter.expression.match(/and\(agency_id\.in\.\(([^)]*)\),seller_id\.eq\.([^)]*)\)/) || []
          const inFull = fullList ? fullList.split(",").includes(row.agency_id) : false
          const inOwn = ownList
            ? ownList.split(",").includes(row.agency_id) && row.seller_id === ownSeller
            : false
          return inFull || inOwn
        })
      )

    const builder: any = {
      select: () => builder,
      eq(column: string, value: any) {
        filters.push({ kind: "eq", column, value })
        return builder
      },
      in(column: string, values: any[]) {
        filters.push({ kind: "in", column, values })
        return builder
      },
      or(expression: string) {
        filters.push({ kind: "or", expression })
        return builder
      },
      async order() {
        return { data: apply(), error: null }
      },
      async maybeSingle() {
        return { data: apply()[0] ?? null, error: null }
      },
    }
    return builder
  }

  return {
    client: { from: (table: string) => makeQuery(table) } as any,
    calls,
  }
}

const baseQuotation = {
  org_id: ORG,
  agency_id: AGENCY,
  seller_id: USER,
  quotation_number: "COT-1",
  status: "SENT",
  total_amount: 1000,
  currency: "USD",
  pricing_mode: "GROUP_TOTAL",
  adults: 2,
  children: 0,
  infants: 0,
  destination: "Cancún",
  valid_until: null,
  public_token: "tok",
}

describe("fetchOperationOrigin", () => {
  it("junta las cotizaciones de la operación, del lead y del cliente sin repetir", async () => {
    const { client } = createClient({
      quotations: [
        { ...baseQuotation, id: "q-op", operation_id: "op-1", lead_id: "lead-1", created_at: "2026-03-01" },
        { ...baseQuotation, id: "q-lead", lead_id: "lead-1", created_at: "2026-02-01" },
        { ...baseQuotation, id: "q-cust", customer_id: "cust-1", created_at: "2026-01-01" },
      ],
      leads: [{ id: "lead-1", org_id: ORG, agency_id: AGENCY, contact_name: "Juan", status: "NEW" }],
    })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: "lead-1",
      customerIds: ["cust-1", "cust-1"],
      scope: scopeFull(),
    })

    // q-op llega por dos vínculos y queda una sola vez, con el más específico.
    expect(origin.quotations.map((q) => q.id)).toEqual(["q-op", "q-lead", "q-cust"])
    expect(origin.quotations.map((q) => q.source)).toEqual(["OPERATION", "LEAD", "CUSTOMER"])
    expect(origin.lead?.contact_name).toBe("Juan")
  })

  it("no devuelve nada de otra organización", async () => {
    const { client } = createClient({
      quotations: [
        { ...baseQuotation, id: "q-propia", lead_id: "lead-1", created_at: "2026-03-01" },
        {
          ...baseQuotation,
          id: "q-ajena",
          org_id: "org-2",
          lead_id: "lead-1",
          created_at: "2026-03-02",
        },
      ],
      leads: [
        { id: "lead-1", org_id: "org-2", agency_id: AGENCY, contact_name: "Ajeno", status: "NEW" },
      ],
    })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: "lead-1",
      scope: scopeFull(),
    })

    expect(origin.quotations.map((q) => q.id)).toEqual(["q-propia"])
    expect(origin.lead).toBeNull()
  })

  it("no devuelve nada de una agencia en la que el usuario no está", async () => {
    const { client } = createClient({
      quotations: [
        { ...baseQuotation, id: "q-otra-agencia", agency_id: OTHER_AGENCY, lead_id: "lead-1", created_at: "2026-03-01" },
      ],
      leads: [
        { id: "lead-1", org_id: ORG, agency_id: OTHER_AGENCY, contact_name: "Otra", status: "NEW" },
      ],
    })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: "lead-1",
      scope: scopeFull(),
    })

    expect(origin.quotations).toEqual([])
    expect(origin.lead).toBeNull()
  })

  it("con 'sólo mis datos' no muestra la cotización de otro vendedor", async () => {
    const { client } = createClient({
      quotations: [
        { ...baseQuotation, id: "q-mia", lead_id: "lead-1", created_at: "2026-03-01" },
        { ...baseQuotation, id: "q-ajena", seller_id: "otro", lead_id: "lead-1", created_at: "2026-03-02" },
      ],
      leads: [],
    })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: "lead-1",
      scope: scopeOwn(),
    })

    expect(origin.quotations.map((q) => q.id)).toEqual(["q-mia"])
  })

  it("el lead se filtra por assigned_seller_id, no por seller_id", async () => {
    // `leads` no tiene columna `seller_id`: si el helper filtrara por el nombre
    // por defecto, PostgREST devolvería un error de columna inexistente y el
    // lead propio del usuario desaparecería de la pantalla.
    const { client, calls } = createClient({
      quotations: [],
      leads: [
        { id: "lead-1", org_id: ORG, agency_id: AGENCY, assigned_seller_id: USER, contact_name: "Mío", status: "NEW" },
      ],
    })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: "lead-1",
      scope: scopeOwn(),
    })

    expect(origin.lead?.contact_name).toBe("Mío")

    const columns = calls.leads[0].map((f: any) => f.column ?? f.expression)
    expect(columns).toContain("assigned_seller_id")
    expect(columns).not.toContain("seller_id")
  })

  it("con 'sólo mis datos' no muestra el lead asignado a otro vendedor", async () => {
    const { client } = createClient({
      quotations: [],
      leads: [
        { id: "lead-1", org_id: ORG, agency_id: AGENCY, assigned_seller_id: "otro", contact_name: "Ajeno", status: "NEW" },
      ],
    })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: "lead-1",
      scope: scopeOwn(),
    })

    expect(origin.lead).toBeNull()
  })

  it("sin permiso de leads no consulta nada", async () => {
    const { client, calls } = createClient({
      quotations: [{ ...baseQuotation, id: "q-1", operation_id: "op-1", created_at: "2026-03-01" }],
      leads: [{ id: "lead-1", org_id: ORG, agency_id: AGENCY, contact_name: "Juan", status: "NEW" }],
    })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: "lead-1",
      scope: scopeBlocked,
    })

    expect(origin).toEqual({ lead: null, quotations: [] })
    expect(calls.quotations).toHaveLength(0)
    expect(calls.leads).toHaveLength(0)
  })

  it("una operación sin lead ni cotizaciones devuelve vacío sin romper", async () => {
    const { client } = createClient({ quotations: [], leads: [] })

    const origin = await fetchOperationOrigin(client, {
      orgId: ORG,
      operationId: "op-1",
      leadId: null,
      scope: scopeFull(),
    })

    expect(origin).toEqual({ lead: null, quotations: [] })
  })
})
