import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/admin/empty-state"
import { createAdminClient } from "@/lib/supabase/server"
import { Activity, Briefcase, LogIn, Target, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

type Item = {
  id: string
  kind: "operation" | "lead" | "payment" | "login"
  occurred_at: string
  title: string
  detail?: string | null
}

const ICONS: Record<Item["kind"], React.ComponentType<{ className?: string }>> = {
  operation: Briefcase,
  lead: Target,
  payment: Wallet,
  login: LogIn,
}

const KIND_LABEL: Record<Item["kind"], string> = {
  operation: "Operación",
  lead: "Lead",
  payment: "Pago",
  login: "Login",
}

const KIND_COLOR: Record<Item["kind"], string> = {
  operation: "bg-primary/15 text-primary",
  lead: "bg-accent-violet/15 text-accent-violet",
  payment: "bg-success/15 text-success",
  login: "bg-muted-foreground/15 text-muted-foreground",
}

export async function OrgActivityTimeline({ orgId }: { orgId: string }) {
  const admin = createAdminClient() as any

  const [
    { data: ops },
    { data: leads },
    { data: pays },
    { data: members },
    { data: authUsers },
  ] = await Promise.all([
    admin
      .from("operations")
      .select("id, status, created_at, sale_amount_total, destination, currency")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(15),
    admin
      .from("leads")
      .select("id, status, list_name, created_at, contact_name, destination")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(15),
    admin
      .from("payments")
      .select("id, amount, currency, status, date_paid, created_at, direction")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(15),
    admin
      .from("users")
      .select("id, auth_id, name, email")
      .eq("org_id", orgId),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  // Map auth_id → last_sign_in_at
  const lastSignIn = new Map<string, string>()
  for (const u of (authUsers as any)?.users ?? []) {
    if (u.last_sign_in_at) lastSignIn.set(u.id, u.last_sign_in_at)
  }

  const items: Item[] = []

  for (const o of (ops ?? []) as any[]) {
    const amount =
      o.sale_amount_total != null
        ? `${o.currency ?? ""} ${Number(o.sale_amount_total).toLocaleString("es-AR")}`.trim()
        : null
    items.push({
      id: `op-${o.id}`,
      kind: "operation",
      occurred_at: o.created_at,
      title: o.destination ? `Nueva operación · ${o.destination}` : "Nueva operación",
      detail: [o.status, amount].filter(Boolean).join(" · ") || null,
    })
  }

  for (const l of (leads ?? []) as any[]) {
    items.push({
      id: `lead-${l.id}`,
      kind: "lead",
      occurred_at: l.created_at,
      title: l.contact_name ? `Nuevo lead · ${l.contact_name}` : "Nuevo lead",
      detail: [l.list_name ?? l.status, l.destination].filter(Boolean).join(" · ") || null,
    })
  }

  for (const p of (pays ?? []) as any[]) {
    const amount = p.amount
      ? `${p.currency ?? ""} ${Number(p.amount).toLocaleString("es-AR")}`.trim()
      : ""
    items.push({
      id: `pay-${p.id}`,
      kind: "payment",
      occurred_at: p.date_paid ?? p.created_at,
      title: `Pago ${amount}`.trim(),
      detail: [p.status, p.direction].filter(Boolean).join(" · ") || null,
    })
  }

  for (const m of (members ?? []) as any[]) {
    const ts = m.auth_id ? lastSignIn.get(m.auth_id) : null
    if (!ts) continue
    items.push({
      id: `login-${m.id}`,
      kind: "login",
      occurred_at: ts,
      title: `Login · ${m.name ?? m.email}`,
      detail: m.email,
    })
  }

  items.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  )
  const top = items.slice(0, 30)

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground text-base">Actividad reciente</CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Sin actividad"
            description="Esta org todavía no registró operaciones, leads, pagos ni logins."
          />
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-5">
            {top.map((it) => {
              const Icon = ICONS[it.kind]
              return (
                <li key={it.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[26px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted",
                      KIND_COLOR[it.kind],
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          KIND_COLOR[it.kind],
                        )}
                      >
                        {KIND_LABEL[it.kind]}
                      </span>
                      <span className="text-muted-foreground">{it.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{relativeTime(it.occurred_at)}</span>
                      {it.detail && (
                        <>
                          <span>·</span>
                          <span>{it.detail}</span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `hace ${months}mes`
  return `hace ${Math.floor(months / 12)}a`
}
