import { createAdminClient } from "@/lib/supabase/server"

export async function AuditLogInline({ orgId }: { orgId: string }) {
  const admin = createAdminClient() as any
  const { data: events } = await admin
    .from("security_audit_log")
    .select("created_at, event_type, severity, actor_user_id, details")
    .eq("target_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10)

  if (!events || events.length === 0) {
    return <div className="text-xs text-muted-foreground">Sin eventos registrados.</div>
  }

  return (
    <div className="space-y-1 text-xs">
      {events.map((e: any, i: number) => (
        <div key={i} className="flex items-start gap-3 py-1 border-b last:border-0">
          <span className="text-muted-foreground min-w-[140px]">
            {new Date(e.created_at).toLocaleString("es-AR")}
          </span>
          <span className="font-mono">{e.event_type}</span>
          <span className="text-muted-foreground">{e.severity}</span>
        </div>
      ))}
    </div>
  )
}
