/**
 * Lectura de socios y de sus distribuciones de ganancia.
 *
 * ESTE ES EL ÚNICO LUGAR QUE DEBE SABER CÓMO SE SCOPEAN LAS TABLAS DE SOCIOS.
 *
 * `partner_accounts` es el único borde de tenant: tiene `org_id` y policy de
 * RLS. `partner_withdrawals` NO tiene ninguna de las dos cosas, y
 * `partner_profit_allocations` tiene `org_id` nullable. En las dos, lo único
 * que separa una query de los datos de otro tenant es filtrar por
 * `partner_id ∈ (socios de la org)`. Si esa resolución se copia a otro archivo,
 * alcanza con que una copia se olvide para que se filtre información.
 */

export interface OrgPartner {
  id: string
  name: string
  /** Participación en la ganancia, 0..100. */
  percentage: number
  isActive: boolean
}

export interface OrgPartners {
  partners: OrgPartner[]
  /** Socios activos: son los que participan del reparto. */
  activeIds: string[]
  /**
   * Todos, incluidos los inactivos. Una distribución histórica puede ser de un
   * socio dado de baja después: filtrarla por activos la haría desaparecer.
   */
  allIds: string[]
}

export async function fetchOrgPartners(supabase: any, orgId: string): Promise<OrgPartners> {
  const { data, error } = await (supabase.from("partner_accounts") as any)
    .select("id, partner_name, profit_percentage, is_active")
    .eq("org_id", orgId)
    .order("partner_name", { ascending: true })

  if (error || !data) return { partners: [], activeIds: [], allIds: [] }

  const partners: OrgPartner[] = (data as any[]).map((p) => ({
    id: p.id,
    name: p.partner_name || "Sin nombre",
    percentage: Number(p.profit_percentage) || 0,
    isActive: p.is_active !== false,
  }))

  return {
    partners,
    activeIds: partners.filter((p) => p.isActive).map((p) => p.id),
    allIds: partners.map((p) => p.id),
  }
}

export interface PartnerAllocationRow {
  partnerId: string
  year: number
  month: number
  /** "YYYY-MM", para cruzar contra `monthKeysBetween`. */
  monthKey: string
  amount: number
  currency: string
  /** TC con el que se distribuyó. Es el que hay que usar para convertir. */
  exchangeRate: number | null
  status: string
}

/**
 * Distribuciones de ganancia de los meses pedidos.
 *
 * `partner_profit_allocations` se guarda por (year, month), no por fecha, así
 * que se pide por año y se recortan los meses en memoria: un `.or()` sobre
 * pares año/mes es ilegible apenas el rango pasa de un par de meses.
 */
export async function fetchPartnerAllocations(
  supabase: any,
  partnerIds: string[],
  monthKeys: string[]
): Promise<PartnerAllocationRow[]> {
  // Sin socios no hay nada que pedir. Importa que sea un early return y no un
  // `.in("partner_id", [])`: una query sin ese filtro sale sin scope de tenant.
  if (partnerIds.length === 0 || monthKeys.length === 0) return []

  const years = Array.from(new Set(monthKeys.map((k) => Number(k.slice(0, 4)))))
  const wanted = new Set(monthKeys)

  const { data, error } = await (supabase.from("partner_profit_allocations") as any)
    .select("partner_id, year, month, profit_amount, currency, exchange_rate, status")
    // Scope de tenant. NO se agrega `.eq("org_id", orgId)`: la columna es
    // nullable y las filas viejas quedarían fuera del reporte mientras siguen
    // contando en el chequeo de duplicados de distribute-profits.
    .in("partner_id", partnerIds)
    .in("year", years)

  if (error || !data) return []

  const rows: PartnerAllocationRow[] = []
  for (const a of data as any[]) {
    const monthKey = `${a.year}-${String(a.month).padStart(2, "0")}`
    if (!wanted.has(monthKey)) continue
    rows.push({
      partnerId: a.partner_id,
      year: Number(a.year),
      month: Number(a.month),
      monthKey,
      amount: Number(a.profit_amount) || 0,
      currency: String(a.currency || "USD").toUpperCase(),
      exchangeRate: a.exchange_rate != null ? Number(a.exchange_rate) : null,
      status: String(a.status || "ALLOCATED"),
    })
  }
  return rows
}
