import { ShieldAlert } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/admin/page-header"
import { EmptyState } from "@/components/admin/empty-state"
import {
  DataTableShell,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
} from "@/components/admin/data-table-shell"

export const dynamic = "force-dynamic"

export default async function AdminAuditPage() {
  const admin = createAdminClient() as any
  const { data: events } = await admin
    .from("security_audit_log")
    .select("id, event_type, severity, actor_user_id, actor_org_id, target_org_id, target_entity, request_path, details, created_at")
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = (events || []) as any[]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description={`Eventos de seguridad de la plataforma. Últimos ${rows.length}.`}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Sin eventos"
          description="Todavía no hay eventos en el audit log."
        />
      ) : (
        <DataTableShell>
          <DataTableHead>
            <tr>
              <DataTableTh>Fecha</DataTableTh>
              <DataTableTh>Severity</DataTableTh>
              <DataTableTh>Tipo</DataTableTh>
              <DataTableTh>Actor org</DataTableTh>
              <DataTableTh>Target org</DataTableTh>
              <DataTableTh>Path</DataTableTh>
              <DataTableTh>Detalle</DataTableTh>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {rows.map((e) => (
              <DataTableRow key={e.id}>
                <DataTableTd className="whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</DataTableTd>
                <DataTableTd className={`font-semibold ${sevClass(e.severity)}`}>{e.severity}</DataTableTd>
                <DataTableTd>{e.event_type}</DataTableTd>
                <DataTableTd className="text-muted-foreground">{e.actor_org_id?.slice(0, 8) || "—"}</DataTableTd>
                <DataTableTd className="text-muted-foreground">{e.target_org_id?.slice(0, 8) || "—"}</DataTableTd>
                <DataTableTd className="text-muted-foreground">{e.request_path || "—"}</DataTableTd>
                <DataTableTd>
                  <details>
                    <summary className="cursor-pointer text-primary">ver</summary>
                    <pre className="text-[10px] mt-1 bg-ink p-2 rounded max-w-md overflow-auto text-muted-foreground">
                      {JSON.stringify(e.details, null, 2)}
                    </pre>
                  </details>
                </DataTableTd>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTableShell>
      )}
    </div>
  )
}

function sevClass(s: string): string {
  switch (s) {
    case "CRITICAL": return "text-destructive"
    case "ERROR": return "text-destructive"
    case "WARN": return "text-accent-coral"
    default: return "text-muted-foreground"
  }
}
