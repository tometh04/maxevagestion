import { createAdminClient } from "@/lib/supabase/server"
import { OrgsSearchBar } from "@/components/admin/orgs-search-bar"
import { OrgsFilters } from "@/components/admin/orgs-filters"
import { OrgsTable } from "@/components/admin/orgs-table"
import { OrgsPagination } from "@/components/admin/orgs-pagination"
import { ORGS_PAGE_SIZE } from "@/lib/admin/constants"
import { PageHeader } from "@/components/admin/page-header"

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

  // Base query desde la VIEW (incluye profile_completion)
  let query: any = admin
    .from("organizations_with_profile_completion")
    .select(
      `id, name, slug, subscription_status, plan, custom_plan_id,
       contact_name, contact_phone, created_at, profile_completion,
       mp_preapproval_id`,
      { count: "exact" },
    )

  // Search
  if (q) {
    if (/^[0-9a-f-]{36}$/i.test(q)) {
      query = query.eq("id", q)
    } else {
      const ilike = `%${q}%`
      query = query.or(
        [
          `name.ilike.${ilike}`,
          `slug.ilike.${ilike}`,
          `cuit.ilike.${ilike}`,
          `billing_email.ilike.${ilike}`,
          `contact_name.ilike.${ilike}`,
          `contact_phone.ilike.${ilike}`,
        ].join(","),
      )
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
      />

      <div className="space-y-3">
        <OrgsSearchBar />
        <OrgsFilters />
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          Error: {error.message}
        </div>
      )}

      <OrgsTable
        orgs={(orgs ?? []) as any}
        sort={sortCol}
        dir={dir}
        buildSortHref={buildSortHref}
      />

      <OrgsPagination page={page} totalPages={totalPages} buildHref={buildPageHref} />
    </div>
  )
}
