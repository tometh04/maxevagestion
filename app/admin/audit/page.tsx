import { createAdminClient } from "@/lib/supabase/server"

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
      <h1 className="text-2xl font-semibold">Security audit log</h1>
      <p className="text-sm text-muted-foreground">Últimos {rows.length} eventos</p>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Severity</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Actor org</th>
              <th className="text-left px-3 py-2">Target org</th>
              <th className="text-left px-3 py-2">Path</th>
              <th className="text-left px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                <td className={`px-3 py-2 font-semibold ${sevClass(e.severity)}`}>{e.severity}</td>
                <td className="px-3 py-2">{e.event_type}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.actor_org_id?.slice(0, 8) || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.target_org_id?.slice(0, 8) || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.request_path || "—"}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-blue-600">ver</summary>
                    <pre className="text-[10px] mt-1 bg-muted p-2 rounded max-w-md overflow-auto">
                      {JSON.stringify(e.details, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function sevClass(s: string): string {
  switch (s) {
    case "CRITICAL": return "text-red-600"
    case "ERROR": return "text-red-500"
    case "WARN": return "text-amber-600"
    default: return "text-muted-foreground"
  }
}
