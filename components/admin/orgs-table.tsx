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
  trial_ends_at: string | null
  current_period_ends_at: string | null
  mp_preapproval_id: string | null
}

type Props = {
  orgs: OrgRow[]
  sort: string
  dir: "asc" | "desc"
  buildSortHref: (col: string) => string
}

// Tags con border + bg para que sean reconocibles a vuelo de ojo.
// ACTIVE pedido por Tomi (2026-05-16): "tag verde" — antes era bg-success/15 muy
// soft, casi imperceptible. Ahora con border verde para que salte.
const STATUS_COLOR: Record<string, string> = {
  TRIAL:           "bg-primary/15 text-primary border border-primary/30",
  TRIALING:        "bg-primary/15 text-primary border border-primary/30",
  ACTIVE:          "bg-success/20 text-success border border-success/40 font-medium",
  PAST_DUE:        "bg-accent-coral/15 text-accent-coral border border-accent-coral/30",
  PENDING_PAYMENT: "bg-accent-coral/15 text-accent-coral border border-accent-coral/30",
  CANCELLED:       "bg-muted-foreground/15 text-muted-foreground border border-border/60",
  SUSPENDED:       "bg-destructive/15 text-destructive border border-destructive/30",
}

// "Vence" = cuándo termina el período/trial actual.
// "Próximo cobro" = cuándo MP intentará cobrar de nuevo.
// Para PRO+MP esos son básicamente la misma fecha. Para CANCELLED no hay
// próximo cobro. Para TRIALING, vence el trial y el primer cobro arranca
// ese mismo día.
function getVencimiento(o: OrgRow): string | null {
  if (o.subscription_status === "TRIALING" || o.subscription_status === "TRIAL") {
    return o.trial_ends_at
  }
  return o.current_period_ends_at
}

function getProximoCobro(o: OrgRow): string | null {
  if (o.subscription_status === "CANCELLED" || o.subscription_status === "SUSPENDED") {
    return null
  }
  return getVencimiento(o)
}

function isDateSoon(iso: string | null, days = 7): boolean {
  if (!iso) return false
  const diffMs = new Date(iso).getTime() - Date.now()
  return diffMs >= 0 && diffMs <= days * 86_400_000
}

function isDatePast(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso).getTime() < Date.now()
}

function formatDateRelative(iso: string | null): string {
  if (!iso) return "—"
  const diffMs = new Date(iso).getTime() - Date.now()
  const days = Math.round(diffMs / 86_400_000)
  if (days === 0) return "hoy"
  if (days > 0 && days < 30) return `en ${days}d`
  if (days < 0 && days > -30) return `hace ${-days}d`
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
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
                "inline-flex items-center gap-1 hover:text-muted-foreground",
                sort === "name" && "text-primary",
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
                "inline-flex items-center gap-1 hover:text-muted-foreground",
                sort === "plan" && "text-primary",
              )}
            >
              Plan
              {sort === "plan" && <span>{dir === "asc" ? "▲" : "▼"}</span>}
            </Link>
          </DataTableTh>
          <DataTableTh>Contacto</DataTableTh>
          <DataTableTh>Vence</DataTableTh>
          <DataTableTh>Próximo cobro</DataTableTh>
          <DataTableTh>
            <Link
              href={buildSortHref("created_at")}
              className={cn(
                "inline-flex items-center gap-1 hover:text-muted-foreground",
                sort === "created_at" && "text-primary",
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
                className="font-medium text-muted-foreground hover:text-primary"
              >
                {o.name}
              </Link>
              <div className="text-xs text-muted-foreground">{o.slug}</div>
            </DataTableTd>
            <DataTableTd>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  STATUS_COLOR[o.subscription_status] ?? "bg-muted text-muted-foreground",
                )}
              >
                {o.subscription_status}
              </span>
            </DataTableTd>
            <DataTableTd>
              {o.plan}
              {o.custom_plan_id && <span className="ml-1 text-accent-coral" title="Custom plan">✦</span>}
            </DataTableTd>
            <DataTableTd>
              {o.contact_name || o.contact_phone ? (
                <>
                  <div className="text-muted-foreground">{o.contact_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{o.contact_phone ?? ""}</div>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DataTableTd>
            <DataTableTd>
              {(() => {
                const vence = getVencimiento(o)
                if (!vence) return <span className="text-muted-foreground">—</span>
                const past = isDatePast(vence)
                const soon = !past && isDateSoon(vence, 7)
                return (
                  <div
                    className={cn(
                      "text-xs",
                      past ? "text-destructive font-medium" : soon ? "text-accent-coral" : "text-muted-foreground",
                    )}
                    title={new Date(vence).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
                  >
                    {formatDateRelative(vence)}
                  </div>
                )
              })()}
            </DataTableTd>
            <DataTableTd>
              {(() => {
                const next = getProximoCobro(o)
                if (!next) return <span className="text-muted-foreground">—</span>
                // Indicador del tipo de cobro: MP auto / manual / —
                const isManual = !!o.custom_plan_id && !o.mp_preapproval_id
                const channelLabel = isManual ? "manual" : o.mp_preapproval_id ? "auto MP" : "—"
                return (
                  <div className="text-xs">
                    <div className="text-muted-foreground">{formatDateRelative(next)}</div>
                    <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                      {channelLabel}
                    </div>
                  </div>
                )
              })()}
            </DataTableTd>
            <DataTableTd className="text-muted-foreground">{relativeTime(o.created_at)}</DataTableTd>
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
