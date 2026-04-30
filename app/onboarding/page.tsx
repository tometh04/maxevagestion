"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PLANS = [
  { id: "STARTER", title: "Starter", users: 3, agencies: 1, ops: 50, desc: "Para agencias recién empezando." },
  { id: "PRO", title: "Pro", users: 10, agencies: 3, ops: 500, desc: "Para operaciones consolidadas." },
  { id: "ENTERPRISE", title: "Enterprise", users: 999, agencies: 99, ops: 99999, desc: "Sin límites prácticos." },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState("")
  const [billingEmail, setBillingEmail] = useState("")
  const [cuit, setCuit] = useState("")
  const [plan, setPlan] = useState("STARTER")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAdvance = step === 1 ? name.trim().length >= 2 : true

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          billing_email: billingEmail.trim() || undefined,
          cuit: cuit.trim() || undefined,
          plan,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || res.statusText)
        setSubmitting(false)
        return
      }
      // Éxito — redirigir al dashboard.
      router.replace("/dashboard")
    } catch (err: any) {
      setError(err.message || "Error desconocido")
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-6 section-aura">
      <Card className="w-full max-w-xl relative z-10 rounded-2xl shadow-card border-border/50">
        <CardHeader className="space-y-3 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-primary">
            Paso {step} de 2
          </span>
          <h1 className="text-3xl font-bold tracking-tighter-h2 leading-[1.1]">
            <span className="text-gradient-signature">Bienvenido a Vibook</span>
          </h1>
          <p className="text-sm text-muted-foreground text-balance">
            Configuramos tu agencia en un minuto.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agency-name">Nombre de la agencia</Label>
                <Input
                  id="agency-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="p.ej. Turismo ABC"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-email">Email de facturación</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  placeholder="admin@tuagencia.com (opcional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuit">CUIT</Label>
                <Input
                  id="cuit"
                  type="text"
                  value={cuit}
                  onChange={(e) => setCuit(e.target.value)}
                  placeholder="30-12345678-9 (opcional)"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-balance">
                Elegí un plan. Arrancás con 14 días de trial sin cargo en cualquiera.
              </p>
              {PLANS.map((p) => (
                <label
                  key={p.id}
                  className={`block border rounded-2xl p-4 cursor-pointer transition-all duration-300 ${
                    plan === p.id
                      ? "border-primary bg-primary/5 shadow-glow"
                      : "border-border/50 hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p.id}
                    checked={plan === p.id}
                    onChange={() => setPlan(p.id)}
                    className="mr-2 accent-primary"
                  />
                  <span className="font-semibold">{p.title}</span>
                  <div className="text-xs text-muted-foreground mt-1">{p.desc}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.users} users · {p.agencies} agencias · {p.ops} operaciones/mes
                  </div>
                </label>
              ))}
            </div>
          )}

          {error && (
            <div className="border border-destructive/15 bg-destructive/5 text-destructive text-sm rounded-md p-3">
              {error}
            </div>
          )}

          <footer className="flex items-center justify-between">
            {step > 1 ? (
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                ← Atrás
              </Button>
            ) : <span />}

            {step === 1 ? (
              <Button
                variant="cta"
                size="lg"
                onClick={() => setStep(2)}
                disabled={!canAdvance}
              >
                Siguiente →
              </Button>
            ) : (
              <Button
                variant="cta"
                size="lg"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? "Creando…" : "Crear agencia"}
              </Button>
            )}
          </footer>
        </CardContent>
      </Card>
    </div>
  )
}
