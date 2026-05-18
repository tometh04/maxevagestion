"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"

const ROLES = ["SELLER", "CONTABLE", "ADMIN", "SUPER_ADMIN"] as const

type Rule = { role: string; max_amount_ars: number | null }

export function AgencyApprovalRulesForm({ agencyId }: { agencyId: string }) {
  const [rules, setRules] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/agencies/${agencyId}/payment-approval-rules`)
      .then((r) => r.json())
      .then((json) => {
        const map: Record<string, string> = {}
        for (const r of (json.rules || []) as Rule[]) {
          map[r.role] = r.max_amount_ars === null ? "" : String(r.max_amount_ars)
        }
        setRules(map)
      })
      .finally(() => setLoading(false))
  }, [agencyId])

  async function save() {
    setSaving(true)
    try {
      const arr: Rule[] = ROLES
        .filter((role) => rules[role] !== undefined)
        .map((role) => ({
          role,
          max_amount_ars: rules[role] === "" ? null : Number(rules[role]),
        }))
      const res = await fetch(`/api/agencies/${agencyId}/payment-approval-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: arr }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Reglas guardadas")
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aprobaciones de pagos</CardTitle>
        <CardDescription>
          Monto máximo en ARS que cada rol puede crear sin requerir aprobación. Vacío = ilimitado. Si el rol no está listado, no requiere aprobación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            {ROLES.map((role) => (
              <div key={role} className="grid grid-cols-2 gap-3 items-center">
                <Label>{role}</Label>
                <DecimalInput
                  placeholder="Vacío = ilimitado"
                  value={rules[role] ?? ""}
                  onChange={(v) => setRules({ ...rules, [role]: v })}
                />
              </div>
            ))}
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar reglas
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
