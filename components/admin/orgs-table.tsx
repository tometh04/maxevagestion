import Link from "next/link"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProfileBadge } from "./profile-badge"
import {
  DataTableShell,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
} from "@/components/admin/data-table-shell"
import { EmptyState } from "@/components/admin/empty-state"

type OrgRow = {
  id: string
  name: string
  slug: string
  subscription_status: string
  plan: string
  custom_plan_id: string | null
  contact_name: string | null
  contact_phone: string | null
  created_at: string
  profile_completion: number
}

type Props = {
  orgs: OrgRow[]
  sort: string
  dir: "asc" | "desc"
  buildSortHref: (col: string) => string
}

const STATUS_COLOR: Record<string, string> = {
  TRIAL:   "bg-blue-500/15 text-blue-300",
  ACTIVE:  "bg-emerald-500/15 text-emerald-300",
  PAST_DUE: "bg-amber-500/15 text-amber-300",
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-300",
  CANCELLED: "bg-slate-500/15 text-slate-300",
  SUSPENDED: "bg-red-500/15 text-red-300",
}

export function OrgsTable({ orgs, sort, dir, buildSortHref }: Props) {
  if (orgs.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Sin resultados"
        description="No encontramos orgs con esos filtros."
      />
    )
  }

  return (
    <DataTableShell>
      <DataTableHead>
        <tr>
          <DataTableTh>Perfil</DataTableTh>
          <DataTableTh>
            <Link
              href={buildSortHref("name")}
              className={cn(
                "inline-flex items-center gap-1 hover:text-slate-200",
                sort === "name" && "text-blue-300",
              )}
            >
              Org
              {sort === "name" && <span>{dir === "asc" ? "▲" : "▼"}</span>}
            </Link>
          </DataTableTh>
          <DataTableTh>Status</DataTableTh>
          <DataTableTh>
            <Link
              href={buildSortHref("plan")}
              className={cn(
                "inline-flex items-center gap-1 hover:text-slate-200",
                sort === "plan" && "text-blue-300",
              )}
            >
              Plan
              {sort === "plan" && <span>{dir === "asc" ? "▲" : "▼"}</span>}
            </Link>
          </DataTableTh>
          <DataTableTh>Contacto</DataTableTh>
          <DataTableTh>
            <Link
              href={buildSortHref("created_at")}
              className={cn(
                "inline-flex items-center gap-1 hover:text-slate-200",
                sort === "created_at" && "text-blue-300",
              )}
            >
              Creada
              {sort === "created_at" && <span>{dir === "asc" ? "▲" : "▼"}</span>}
            </Link>
          </DataTableTh>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {orgs.map((o) => (
          <DataTableRow key={o.id}>
            <DataTableTd>
              <ProfileBadge completion={o.profile_completion} showCount />
            </DataTableTd>
            <DataTableTd>
              <Link
                href={`/admin/orgs/${o.id}`}
                className="font-medium text-slate-100 hover:text-blue-300"
              >
                {o.name}
              </Link>
              <div className="text-xs text-slate-500">{o.slug}</div>
            </DataTableTd>
            <DataTableTd>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  STATUS_COLOR[o.subscription_status] ?? "bg-slate-700 text-slate-300",
                )}
              >
                {o.subscription_status}
              </span>
            </DataTableTd>
            <DataTableTd>
              {o.plan}
              {o.custom_plan_id && <span className="ml-1 text-amber-300" title="Custom plan">✦</span>}
            </DataTableTd>
            <DataTableTd>
              {o.contact_name || o.contact_phone ? (
                <>
                  <div className="text-slate-200">{o.contact_name ?? "—"}</div>
                  <div className="text-xs text-slate-500">{o.contact_phone ?? ""}</div>
                </>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </DataTableTd>
            <DataTableTd className="text-slate-400">{relativeTime(o.created_at)}</DataTableTd>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTableShell>
  )
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return "hoy"
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}m`
  return `${Math.floor(months / 12)}a`
}
