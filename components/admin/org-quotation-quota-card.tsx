"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function OrgQuotationQuotaCard({ orgId }: { orgId: string }) {
  const [data, setData] = React.useState<any>(null)
  const [included, setIncluded] = React.useState("")
  const [enabled, setEnabled] = React.useState(false)
  const [units, setUnits] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const load = React.useCallback(async () => {
    const response = await fetch(`/api/admin/orgs/${orgId}/quotation-quota`, { cache: "no-store" })
    if (!response.ok) return
    const payload = await response.json()
    setData(payload)
    setIncluded(String(payload.override?.included_documents ?? payload.usage?.included ?? ""))
    setEnabled(payload.override?.enforcement_enabled ?? payload.usage?.enforcement_enabled ?? false)
  }, [orgId])
  React.useEffect(() => { void load() }, [load])

  async function submit(body: unknown) {
    setSaving(true)
    const response = await fetch(`/api/admin/orgs/${orgId}/quotation-quota`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) { toast.success("Cupo actualizado"); await load() }
    else toast.error(payload.error || "No se pudo actualizar el cupo")
    setSaving(false)
    return response.ok
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Cupo de cotizaciones</CardTitle><CardDescription>Override de esta organización y bonificaciones para el ciclo vigente.</CardDescription></CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit({ action: "override", included_documents: Number(included), enforcement_enabled: enabled }) }}>
          <div className="space-y-1.5"><Label>PDFs incluidos por ciclo</Label><Input type="number" min="0" value={included} onChange={(e) => setIncluded(e.target.value)} required /></div>
          <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"><Label>Bloquear al alcanzar el límite</Label><Switch checked={enabled} onCheckedChange={setEnabled} /></div>
          <Button type="submit" disabled={saving}>Guardar override</Button>
          <p className="text-xs text-muted-foreground">El enforcement empieza en el próximo ciclo. Uso actual: {data?.usage?.used ?? "—"}.</p>
        </form>
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await submit({ action: "grant", units: Number(units), reason })) { setUnits(""); setReason("") } }}>
          <div className="space-y-1.5"><Label>Créditos manuales</Label><Input type="number" min="1" value={units} onChange={(e) => setUnits(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Motivo de auditoría</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required /></div>
          <Button type="submit" variant="outline" disabled={saving}>Acreditar hasta fin del ciclo</Button>
          <p className="text-xs text-muted-foreground">Vencimiento: {data?.usage?.ends_at ? new Date(data.usage.ends_at).toLocaleDateString("es-AR") : "sin ciclo activo"}.</p>
        </form>
      </CardContent>
    </Card>
  )
}
