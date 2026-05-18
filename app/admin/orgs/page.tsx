import Link from "next/link"
import { Plus } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { OrgsSearchBar } from "@/components/admin/orgs-search-bar"
import { OrgsFilters } from "@/components/admin/orgs-filters"
import { OrgsTable } from "@/components/admin/orgs-table"
import { OrgsPagination } from "@/components/admin/orgs-pagination"
import { ORGS_PAGE_SIZE } from "@/lib/admin/constants"
import { PageHeader } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

type Search = {
  q?: string
  status?: string
  plan?: string
  completion?: string
  has_custom_plan?: string
  has_preapproval?: string
  sort?: string
  dir?: string
  page?: string
}

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ""
  const status = sp.status ?? null
  const plan = sp.plan ?? null
  const completion = sp.completion ?? null
  const hasCustomPlan = sp.has_custom_plan === "true"
  const hasPreapproval = sp.has_preapproval === "true"
  const sort = sp.sort ?? "created_at"
  const dir = sp.dir === "asc" ? "asc" : "desc"
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)

  const admin = createAdminClient()

  // Pre-search: orgs creadas con el wizard nuevo guardan contacto en
  // organization_settings (no en organizations.contact_name/phone que están
  // deprecated). Si hay query de texto, buscamos org_ids que matchean por
  // settings y los sumamos al OR de búsqueda principal.
  let settingsMatchedIds: string[] = []
  if (q && !/^[0-9a-f-]{36}$/i.test(q)) {
    const { data: matchingSettings } = await admin
      .from("organization_settings")
      .select("org_id")
      .in("key", ["company_name", "phone", "company_phone", "email", "company_email"])
      .ilike("value", `%${q}%`)
    settingsMatchedIds = Array.from(
      new Set(((matchingSettings ?? []) as any[]).map((s) => s.org_id)),
    )
  }

  // Base query desde la VIEW (incluye profile_completion)
  // 2026-05-16: agregamos trial_ends_at + current_period_ends_at para la nueva
  // columna "Vence/Próximo cobro" en la tabla.
  let query: any = admin
    .from("organizations_with_profile_completion")
    .select(
      `id, name, slug, subscription_status, plan, custom_plan_id,
       contact_name, contact_phone, created_at, profile_completion,
       mp_preapproval_id, trial_ends_at, current_period_ends_at`,
      { count: "exact" },
    )

  // Search
  if (q) {
    if (/^[0-9a-f-]{36}$/i.test(q)) {
      query = query.eq("id", q)
    } else {
      const ilike = `%${q}%`
      const orParts = [
        `name.ilike.${ilike}`,
        `slug.ilike.${ilike}`,
        `cuit.ilike.${ilike}`,
        `billing_email.ilike.${ilike}`,
        `contact_name.ilike.${ilike}`,
        `contact_phone.ilike.${ilike}`,
      ]
      if (settingsMatchedIds.length > 0) {
        orParts.push(`id.in.(${settingsMatchedIds.join(",")})`)
      }
      query = query.or(orParts.join(","))
    }
  }

  // Filters
  if (status) query = query.eq("subscription_status", status)
  if (plan === "CUSTOM") {
    query = query.not("custom_plan_id", "is", null)
  } else if (plan) {
    query = query.eq("plan", plan)
  }
  if (completion === "empty") query = query.eq("profile_completion", 0)
  if (completion === "complete") query = query.eq("profile_completion", 9)
  if (completion === "partial") {
    query = query.gt("profile_completion", 0).lt("profile_completion", 9)
  }
  if (hasCustomPlan) query = query.not("custom_plan_id", "is", null)
  if (hasPreapproval) query = query.not("mp_preapproval_id", "is", null)

  // Sort (whitelist)
  const SORTABLE = new Set(["name", "plan", "created_at", "profile_completion"])
  const sortCol = SORTABLE.has(sort) ? sort : "created_at"
  query = query.order(sortCol, { ascending: dir === "asc" })

  // Pagination
  const from = (page - 1) * ORGS_PAGE_SIZE
  const to = from + ORGS_PAGE_SIZE - 1
  query = query.range(from, to)

  const { data: orgs, count, error } = await query

  // Hydrate contacto desde organization_settings: las orgs creadas con el wizard
  // nuevo no escriben contact_name/phone en organizations (deprecated). Sin esto
  // la columna "Contacto" sale vacía para tenants nuevos.
  const orgIds = ((orgs ?? []) as any[]).map((o: any) => o.id)
  const settingsByOrg = new Map<string, Record<string, string>>()
  if (orgIds.length > 0) {
    const { data: settingsRows } = await admin
      .from("organization_settings")
      .select("org_id, key, value")
      .in("org_id", orgIds)
      .in("key", ["company_name", "phone", "company_phone"])
    for (const s of (settingsRows ?? []) as any[]) {
      if (!settingsByOrg.has(s.org_id)) settingsByOrg.set(s.org_id, {})
      settingsByOrg.get(s.org_id)![s.key] = s.value
    }
  }
  const hydratedOrgs = ((orgs ?? []) as any[]).map((o: any) => {
    const settings = settingsByOrg.get(o.id) ?? {}
    return {
      ...o,
      contact_name: settings.company_name ?? o.contact_name,
      contact_phone: settings.phone ?? settings.company_phone ?? o.contact_phone,
    }
  })

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / ORGS_PAGE_SIZE))

  // Helper para construir hrefs preservando params actuales
  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (status) params.set("status", status)
    if (plan) params.set("plan", plan)
    if (completion) params.set("completion", completion)
    if (hasCustomPlan) params.set("has_custom_plan", "true")
    if (hasPreapproval) params.set("has_preapproval", "true")
    params.set("sort", sortCol)
    params.set("dir", dir)
    params.set("page", String(page))
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    return `/admin/orgs?${params.toString()}`
  }

  function buildSortHref(col: string) {
    const newDir = sortCol === col && dir === "desc" ? "asc" : "desc"
    return buildHref({ sort: col, dir: newDir, page: "1" })
  }

  function buildPageHref(p: number) {
    return buildHref({ page: String(p) })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizaciones"
        description={`${count ?? 0} ${count === 1 ? "org" : "orgs"} · ${ORGS_PAGE_SIZE}/pág`}
        actions={
          <Button asChild size="sm">
            <Link href="/admin/orgs/new">
              <Plus className="h-4 w-4 mr-1" /> Nueva agencia
            </Link>
          </Button>
        }
      />

      <div className="space-y-3">
        <OrgsSearchBar />
        <OrgsFilters />
      </div>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Error: {error.message}
        </div>
      )}

      <OrgsTable
        orgs={hydratedOrgs as any}
        sort={sortCol}
        dir={dir}
        buildSortHref={buildSortHref}
      />

      <OrgsPagination page={page} totalPages={totalPages} buildHref={buildPageHref} />
    </div>
  )
}
