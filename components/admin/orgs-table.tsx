import Link from "next/link"
import { cn } from "@/lib/utils"
import { ProfileBadge } from "./profile-badge"

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
      <div className="rounded border border-slate-800 p-8 text-center text-sm text-slate-400">
        Sin resultados.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <Th>Perfil</Th>
            <Th sortable href={buildSortHref("name")} active={sort === "name"} dir={dir}>
              Org
            </Th>
            <Th>Status</Th>
            <Th sortable href={buildSortHref("plan")} active={sort === "plan"} dir={dir}>
              Plan
            </Th>
            <Th>Contacto</Th>
            <Th
              sortable
              href={buildSortHref("created_at")}
              active={sort === "created_at"}
              dir={dir}
            >
              Creada
            </Th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr
              key={o.id}
              className="border-t border-slate-800 hover:bg-slate-900/40"
            >
              <Td>
                <ProfileBadge completion={o.profile_completion} showCount />
              </Td>
              <Td>
                <Link
                  href={`/admin/orgs/${o.id}`}
                  className="font-medium text-slate-100 hover:text-blue-300"
                >
                  {o.name}
                </Link>
                <div className="text-xs text-slate-500">{o.slug}</div>
              </Td>
              <Td>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs",
                    STATUS_COLOR[o.subscription_status] ?? "bg-slate-700 text-slate-300",
                  )}
                >
                  {o.subscription_status}
                </span>
              </Td>
              <Td>
                {o.plan}
                {o.custom_plan_id && <span className="ml-1 text-amber-300" title="Custom plan">✦</span>}
              </Td>
              <Td>
                {o.contact_name || o.contact_phone ? (
                  <>
                    <div className="text-slate-200">{o.contact_name ?? "—"}</div>
                    <div className="text-xs text-slate-500">{o.contact_phone ?? ""}</div>
                  </>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </Td>
              <Td className="text-slate-400">{relativeTime(o.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  children,
  sortable,
  href,
  active,
  dir,
}: {
  children: React.ReactNode
  sortable?: boolean
  href?: string
  active?: boolean
  dir?: "asc" | "desc"
}) {
  if (!sortable) return <th className="px-3 py-2 text-left">{children}</th>
  return (
    <th className="px-3 py-2 text-left">
      <Link
        href={href!}
        className={cn(
          "inline-flex items-center gap-1 hover:text-slate-200",
          active && "text-blue-300",
        )}
      >
        {children}
        {active && <span>{dir === "asc" ? "▲" : "▼"}</span>}
      </Link>
    </th>
  )
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={cn("px-3 py-2 align-top", className)}>{children}</td>
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
