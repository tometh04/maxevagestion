"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-xl bg-background border rounded-lg p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Bienvenido a MAXEVA</h1>
          <p className="text-sm text-muted-foreground">
            Paso {step} de 2 — configuramos tu agencia en un minuto.
          </p>
        </header>

        {step === 1 && (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium">Nombre de la agencia</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 border rounded px-3 py-2 bg-background"
                placeholder="p.ej. Turismo ABC"
                autoFocus
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Email de facturación</span>
              <input
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                className="w-full mt-1 border rounded px-3 py-2 bg-background"
                placeholder="admin@tuagencia.com (opcional)"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">CUIT</span>
              <input
                type="text"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                className="w-full mt-1 border rounded px-3 py-2 bg-background"
                placeholder="30-12345678-9 (opcional)"
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Elegí un plan. Arrancás con 14 días de trial sin cargo en cualquiera.
            </p>
            {PLANS.map((p) => (
              <label
                key={p.id}
                className={`block border rounded p-3 cursor-pointer ${
                  plan === p.id ? "border-blue-500 bg-blue-50/50" : ""
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  checked={plan === p.id}
                  onChange={() => setPlan(p.id)}
                  className="mr-2"
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
          <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded p-3">
            {error}
          </div>
        )}

        <footer className="flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(1)}
              className="text-sm text-muted-foreground hover:underline"
              disabled={submitting}
            >
              ← Atrás
            </button>
          ) : <span />}

          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!canAdvance}
              className="text-sm px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="text-sm px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            >
              {submitting ? "Creando…" : "Crear agencia"}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
