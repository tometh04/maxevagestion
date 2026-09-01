"use client"

import * as React from "react"
import { Loader2, PackagePlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { formatArs } from "@/lib/billing/plans"

const PLAN_IDS = ["STARTER", "PRO", "ENTERPRISE"] as const

export function QuotationQuotaAdminCard() {
  const [data, setData] = React.useState<any>({ plans: [], packages: [], organizations: [] })
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState({ name: "", units: "", price: "", targetPlan: "", targetOrg: "" })

  const load = React.useCallback(async () => {
    setLoading(true)
    const response = await fetch("/api/admin/billing/quotation-quota", { cache: "no-store" })
    if (response.ok) setData(await response.json())
    setLoading(false)
  }, [])
  React.useEffect(() => { void load() }, [load])

  async function savePlan(planId: string, included: number, enabled: boolean) {
    setSaving(planId)
    const response = await fetch("/api/admin/billing/quotation-quota", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "plan", plan_id: planId, included_documents: included, enforcement_enabled: enabled }),
    })
    if (response.ok) {
      toast.success(`Cupo ${planId} actualizado`)
      await load()
    } else toast.error("No se pudo actualizar el cupo")
    setSaving(null)
  }

  async function createPackage(event: React.FormEvent) {
    event.preventDefault()
    setSaving("new-package")
    const response = await fetch("/api/admin/billing/quotation-quota", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        units: Number(draft.units),
        price_ars: Number(draft.price),
        target_plan: draft.targetOrg ? null : draft.targetPlan || null,
        target_org_id: draft.targetOrg || null,
        sort_order: 0,
      }),
    })
    if (response.ok) {
      toast.success("Paquete creado")
      setDraft({ name: "", units: "", price: "", targetPlan: "", targetOrg: "" })
      await load()
    } else {
      const payload = await response.json().catch(() => ({}))
      toast.error(payload.error || "No se pudo crear el paquete")
    }
    setSaving(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cupos de cotizaciones</CardTitle>
        <CardDescription>
          PDFs incluidos por ciclo y paquetes de compra única. Al activar un plan, las organizaciones existentes comienzan a bloquear desde su próximo ciclo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="grid gap-3 md:grid-cols-3">
            {PLAN_IDS.map((planId) => {
              const row = data.plans.find((item: any) => item.plan_id === planId)
              return <PlanQuotaEditor key={planId} planId={planId} row={row} saving={saving === planId} onSave={savePlan} />
            })}
          </div>
        )}

        <div className="border-t border-border/50 pt-5">
          <div className="mb-3 flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Paquetes</h3>
          </div>
          <form onSubmit={createPackage} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_0.55fr_0.7fr_0.8fr_1fr_auto] xl:items-end">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Unidades</Label><Input type="number" min="1" value={draft.units} onChange={(e) => setDraft({ ...draft, units: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Precio ARS</Label><Input type="number" min="1" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} required /></div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.targetPlan} disabled={Boolean(draft.targetOrg)} onChange={(e) => setDraft({ ...draft, targetPlan: e.target.value })}>
                <option value="">Todos</option>
                {PLAN_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Organización</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.targetOrg} onChange={(e) => setDraft({ ...draft, targetOrg: e.target.value, targetPlan: e.target.value ? "" : draft.targetPlan })}>
                <option value="">Todas</option>
                {data.organizations.map((org: any) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </div>
            <Button type="submit" disabled={saving === "new-package"}>{saving === "new-package" ? "Creando..." : "Crear"}</Button>
          </form>

          <div className="mt-4 divide-y divide-border/50 rounded-xl border border-border/50">
            {data.packages.map((pack: any) => (
              <div key={pack.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div><p className="font-medium">{pack.name}</p><p className="text-xs text-muted-foreground">{pack.units} PDFs · {formatArs(Number(pack.price_ars))} · {pack.target_org_id ? data.organizations.find((org: any) => org.id === pack.target_org_id)?.name || "Organización específica" : pack.target_plan || "Todos los planes"}</p></div>
                <Button variant="outline" size="sm" onClick={async () => {
                  await fetch("/api/admin/billing/quotation-quota", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "package", id: pack.id, active: !pack.active }) })
                  await load()
                }}>{pack.active ? "Desactivar" : "Activar"}</Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PlanQuotaEditor({ planId, row, saving, onSave }: { planId: string; row: any; saving: boolean; onSave: (id: string, included: number, enabled: boolean) => void }) {
  const [included, setIncluded] = React.useState(String(row?.included_documents ?? ""))
  const [enabled, setEnabled] = React.useState(row?.enforcement_enabled === true)
  React.useEffect(() => { setIncluded(String(row?.included_documents ?? "")); setEnabled(row?.enforcement_enabled === true) }, [row])
  return (
    <div className="rounded-xl border border-border/50 p-4">
      <p className="text-sm font-semibold">{planId}</p>
      <div className="mt-3 space-y-1.5"><Label>PDFs por ciclo</Label><Input type="number" min="0" value={included} onChange={(e) => setIncluded(e.target.value)} /></div>
      <div className="mt-3 flex items-center justify-between"><Label>Enforcement</Label><Switch checked={enabled} onCheckedChange={setEnabled} /></div>
      <Button className="mt-4 w-full" size="sm" disabled={saving || included === ""} onClick={() => onSave(planId, Number(included), enabled)}>{saving ? "Guardando..." : "Guardar"}</Button>
    </div>
  )
}
