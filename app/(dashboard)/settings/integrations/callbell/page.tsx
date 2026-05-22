import { getScopedContext } from "@/lib/supabase/scoped-client"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function CallbellIntegrationPage() {
  const { supabase, orgId } = await getScopedContext()

  // Fetch org crm_mode and last_callbell_sync_at
  const { data: org } = await supabase
    .from("organizations")
    .select("crm_mode, last_callbell_sync_at")
    .eq("id", orgId)
    .single()

  if (!org || org.crm_mode !== "advanced") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Integración Callbell</h1>
        <p className="text-muted-foreground mt-2">
          Esta organización no está en modo CRM avanzado.
        </p>
      </div>
    )
  }

  // Fetch org_integrations rows
  const { data: integrations } = await supabase
    .from("org_integrations")
    .select("integration, is_active, created_at, updated_at")
    .eq("org_id", orgId)
    .in("integration", ["manychat", "callbell-in", "callbell-out"])

  // Fetch latest 20 webhook_event_log rows
  const { data: events } = await supabase
    .from("webhook_event_log")
    .select("integration, event_type, processed_at, result")
    .eq("org_id", orgId)
    .order("processed_at", { ascending: false })
    .limit(20)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Nunca"
    return new Date(dateStr).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const resultColor = (result: string | null) => {
    switch (result) {
      case "ok":
        return "text-green-600"
      case "error":
        return "text-red-600"
      case "duplicate":
        return "text-gray-500"
      case "ignored":
        return "text-muted-foreground"
      default:
        return ""
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Integración Callbell</h1>

      {/* Card 1 — Última sincronización */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold">
            Última sincronización
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-sm">
            {formatDate(org.last_callbell_sync_at ?? null)}
          </p>
        </CardContent>
      </Card>

      {/* Card 2 — Estado de integraciones */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold">
            Estado de integraciones
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {!integrations || integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay integraciones configuradas.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Integration</th>
                  <th className="pb-2 pr-4 font-medium">Activa</th>
                  <th className="pb-2 font-medium">Última actualización</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((row) => (
                  <tr key={row.integration} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">
                      {row.integration}
                    </td>
                    <td className="py-2 pr-4">
                      {row.is_active ? (
                        <span className="text-green-600 font-semibold">✓</span>
                      ) : (
                        <span className="text-red-600 font-semibold">✗</span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {formatDate(row.updated_at ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Card 3 — Últimos 20 eventos */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold">
            Últimos 20 eventos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {!events || events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay eventos registrados aún.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Cuándo</th>
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 pr-4 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {formatDate(evt.processed_at ?? null)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {evt.integration ?? "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {evt.event_type ?? "—"}
                    </td>
                    <td className={`py-2 font-medium ${resultColor(evt.result ?? null)}`}>
                      {evt.result ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
