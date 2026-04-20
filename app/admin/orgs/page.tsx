import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface OrgRow {
  id: string
  slug: string
  name: string
  plan: string | null
  subscription_status: string | null
  max_users: number | null
  max_agencies: number | null
  max_operations_per_month: number | null
  trial_ends_at: string | null
  created_at: string
}

export default async function AdminOrgsPage() {
  // Platform admin bypassa RLS intencionalmente — ve todas las orgs.
  const admin = createAdminClient() as any
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, slug, name, plan, subscription_status, max_users, max_agencies, max_operations_per_month, trial_ends_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = (orgs || []) as OrgRow[]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Organizaciones</h1>
        <p className="text-sm text-muted-foreground">{rows.length} tenants totales</p>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Slug</th>
              <th className="text-left px-3 py-2">Plan</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Límites</th>
              <th className="text-left px-3 py-2">Creada</th>
              <th className="text-left px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((org) => (
              <tr key={org.id} className="border-t">
                <td className="px-3 py-2 font-medium">{org.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{org.slug}</td>
                <td className="px-3 py-2">{org.plan || "—"}</td>
                <td className="px-3 py-2">
                  <span className={statusClass(org.subscription_status)}>
                    {org.subscription_status || "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  users={org.max_users ?? "∞"} · agencies={org.max_agencies ?? "∞"} · ops={org.max_operations_per_month ?? "∞"}/mo
                </td>
                <td className="px-3 py-2 text-xs">{new Date(org.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/orgs/${org.id}`} className="text-blue-600 hover:underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function statusClass(s: string | null): string {
  switch (s) {
    case "ACTIVE": return "text-green-600"
    case "TRIAL": return "text-blue-600"
    case "PAST_DUE": return "text-amber-600"
    case "SUSPENDED": return "text-red-600"
    default: return "text-muted-foreground"
  }
}
