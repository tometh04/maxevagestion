"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ChevronRight, ChevronLeft, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type FormState = {
  org_name: string
  cuit: string
  agency_name: string
  default_currency: "ARS" | "USD"
  admin_email: string
  admin_name: string
  seed_chart_of_accounts: boolean
  seed_manychat_lists: boolean
}

const STEPS = [
  { n: 1, label: "Org" },
  { n: 2, label: "Agencia" },
  { n: 3, label: "Admin" },
  { n: 4, label: "Setup" },
  { n: 5, label: "Confirmar" },
] as const

const INITIAL: FormState = {
  org_name: "",
  cuit: "",
  agency_name: "",
  default_currency: "USD",
  admin_email: "",
  admin_name: "",
  seed_chart_of_accounts: true,
  seed_manychat_lists: true,
}

export function NewOrgWizard() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function canAdvance(): boolean {
    if (step === 1) return form.org_name.trim().length >= 2
    if (step === 2) return true
    if (step === 3) return /\S+@\S+\.\S+/.test(form.admin_email) && form.admin_name.trim().length >= 2
    if (step === 4) return true
    return true
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          agency_name: form.agency_name.trim() || form.org_name.trim(),
          cuit: form.cuit.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`)
        setSubmitting(false)
        return
      }
      router.replace(`/admin/orgs/${json.org.id}`)
    } catch (err: any) {
      setError(err?.message || "Error desconocido")
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Stepper current={step} />

      <Card className="bg-ink/40 border-muted-foreground p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-muted-foreground">Datos de la organización</h2>
            <div className="space-y-2">
              <Label htmlFor="org_name">Nombre de la org *</Label>
              <Input
                id="org_name"
                value={form.org_name}
                onChange={(e) => update("org_name", e.target.value)}
                placeholder="Viajes Pampa SA"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">El slug se genera automático del nombre.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuit">CUIT (opcional)</Label>
              <Input
                id="cuit"
                value={form.cuit}
                onChange={(e) => update("cuit", e.target.value)}
                placeholder="30-12345678-9"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-muted-foreground">Agencia inicial + moneda</h2>
            <div className="space-y-2">
              <Label htmlFor="agency_name">Nombre de la agencia</Label>
              <Input
                id="agency_name"
                value={form.agency_name}
                onChange={(e) => update("agency_name", e.target.value)}
                placeholder={form.org_name || "Sucursal Centro"}
              />
              <p className="text-xs text-muted-foreground">
                Si lo dejás vacío, se usa el nombre de la org.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Moneda default</Label>
              <Select
                value={form.default_currency}
                onValueChange={(v) => update("default_currency", v as "ARS" | "USD")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — Dólares (default agencias AR)</SelectItem>
                  <SelectItem value="ARS">ARS — Pesos argentinos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-muted-foreground">Usuario admin</h2>
            <p className="text-sm text-muted-foreground">
              Se le manda un email de invitación con link para setear su password. No vas a setear
              vos la contraseña.
            </p>
            <div className="space-y-2">
              <Label htmlFor="admin_name">Nombre completo *</Label>
              <Input
                id="admin_name"
                value={form.admin_name}
                onChange={(e) => update("admin_name", e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin_email">Email *</Label>
              <Input
                id="admin_email"
                type="email"
                value={form.admin_email}
                onChange={(e) => update("admin_email", e.target.value)}
                placeholder="juan@viajespampa.com"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-muted-foreground">Setup inicial</h2>
            <div className="flex items-start gap-3 rounded-md border border-muted-foreground bg-ink/40 p-4">
              <Checkbox
                id="seed_chart"
                checked={form.seed_chart_of_accounts}
                onCheckedChange={(v) => update("seed_chart_of_accounts", v === true)}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="seed_chart" className="cursor-pointer">
                  Clonar plan de cuentas estándar AR (recomendado)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Copia toda la jerarquía de cuentas estándar para una agencia argentina (basada en el
                  plan de Lozada Viajes — el caso de uso de referencia). Si lo dejás vacío, el cliente
                  arranca con plan en blanco.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-muted-foreground bg-ink/40 p-4">
              <Checkbox
                id="seed_lists"
                checked={form.seed_manychat_lists}
                onCheckedChange={(v) => update("seed_manychat_lists", v === true)}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="seed_lists" className="cursor-pointer">
                  Crear 7 listas Manychat default (recomendado)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Argentina, Caribe, Brasil, EEUU, Europa, Exoticos, Otros — para que el CRM no
                  arranque vacío cuando lleguen leads.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-muted-foreground">Confirmar y crear</h2>
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <SummaryRow label="Org" value={form.org_name} />
              <SummaryRow label="CUIT" value={form.cuit || "—"} />
              <SummaryRow label="Agencia" value={form.agency_name || form.org_name} />
              <SummaryRow label="Moneda" value={form.default_currency} />
              <SummaryRow label="Admin" value={`${form.admin_name} <${form.admin_email}>`} />
              <SummaryRow label="Plan cuentas" value={form.seed_chart_of_accounts ? "Clonar Lozada" : "Vacío"} />
              <SummaryRow label="Listas CRM" value={form.seed_manychat_lists ? "7 listas default" : "Vacío"} />
            </dl>
            {error && (
              <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 1 || submitting}
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4 | 5) : s))}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
        </Button>

        {step < 5 ? (
          <Button
            type="button"
            disabled={!canAdvance()}
            onClick={() => setStep((s) => (s < 5 ? ((s + 1) as 1 | 2 | 3 | 4 | 5) : s))}
          >
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" /> Crear organización
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, idx) => {
        const isDone = current > s.n
        const isActive = current === s.n
        return (
          <li key={s.n} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                isActive && "border-primary bg-primary/20 text-primary",
                isDone && "border-success bg-success/20 text-success",
                !isActive && !isDone && "border-muted-foreground text-muted-foreground",
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : s.n}
            </div>
            <span
              className={cn(
                "text-xs hidden sm:inline",
                isActive ? "text-muted-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={cn("flex-1 h-px", isDone ? "bg-success/40" : "bg-ink")} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-muted-foreground font-medium">{value}</dd>
    </>
  )
}
