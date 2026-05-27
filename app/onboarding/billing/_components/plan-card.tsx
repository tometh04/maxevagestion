"use client"

import { useState } from "react"
import { ArrowRight, Check, Sparkles, Zap } from "lucide-react"
import { PLANS, SALES_CONTACT_URL, formatArs, type PlanId } from "@/lib/billing/plans"

/**
 * Plan card — styled to match landing (vibook.ai/#pricing).
 * Dark bg, blue/purple accents, glowing gradient effects.
 */
export function PlanCard({ planId, trialAvailable = true }: { planId: PlanId; trialAvailable?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = PLANS[planId]

  async function elegir() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      })
      const body = await res.json()
      if (!res.ok || !body.init_point) {
        setError(body.error || "No se pudo iniciar el checkout")
        setLoading(false)
        return
      }
      window.location.href = body.init_point
    } catch (err: any) {
      setError(err.message || "Error inesperado")
      setLoading(false)
    }
  }

  // Enterprise variant — purple accent, WhatsApp CTA
  if (plan.contactSalesOnly) {
    return (
      <div className="relative group">
        <div className="h-full rounded-2xl p-8 bg-gradient-to-b from-accent-violet/5 to-transparent border border-white/[0.08] hover:border-accent-violet/30 hover:-translate-y-0.5 hover:shadow-elegant transition-all duration-300">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white mb-2 tracking-tight-h2">{plan.name}</h3>
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          </div>

          <div className="mb-8 min-h-[88px]">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white tracking-tighter-h2">{plan.priceLabel || "Consultar"}</span>
            </div>
          </div>

          <a
            href={SALES_CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 text-center rounded-xl font-medium bg-white/10 text-white hover:bg-white/20 hover:-translate-y-0.5 transition-all mb-8"
          >
            <span className="inline-flex items-center gap-2">
              Hablar por WhatsApp
              <ArrowRight className="w-4 h-4" />
            </span>
          </a>

          <div className="mb-6 p-3 rounded-lg bg-accent-violet/10 border border-accent-violet/20 flex items-start gap-2">
            <Zap className="w-4 h-4 text-accent-violet shrink-0 mt-0.5" />
            <p className="text-xs text-accent-violet leading-relaxed">
              Armamos el bot que conecta <strong>Meta Ads, Google Ads y Manychat</strong> directo a tu CRM.
              Los leads entran automáticos, tu equipo sólo cierra.
            </p>
          </div>

          <ul className="space-y-3">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-accent-violet/20">
                  <Check className="w-3 h-3 text-accent-violet" />
                </div>
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  // PRO variant — popular/blue accent, el plan recomendado
  return (
    <div className="relative group md:-mt-4 md:mb-4">
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-1.5 bg-cta-gradient text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-glow">
          <Sparkles className="w-3 h-3" />
          Más elegido
        </div>
      </div>

      <div className="h-full rounded-2xl p-8 bg-gradient-to-b from-primary/10 to-transparent border-2 border-primary/30 hover:border-primary/50 shadow-glow hover:-translate-y-0.5 transition-all duration-300">
        <div className="mb-6">
          <h3 className="text-xl font-bold text-white mb-2 tracking-tight-h2">{plan.name}</h3>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </div>

        <div className="mb-8 min-h-[88px]">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-white tracking-tighter-h2">
              {plan.priceArsMonthly !== null ? formatArs(plan.priceArsMonthly) : "—"}
            </span>
            <span className="text-muted-foreground">/mes</span>
          </div>
          {trialAvailable && plan.trialDays ? (
            <p className="text-sm text-muted-foreground mt-2">
              {plan.trialDays} días de prueba gratuita · sin cobro hasta el día {plan.trialDays + 1}
            </p>
          ) : null}
        </div>

        <button
          onClick={elegir}
          disabled={loading}
          className="block w-full py-3 text-center rounded-xl font-medium bg-cta-gradient text-white shadow-glow hover:-translate-y-0.5 hover:scale-[1.01] transition-all mb-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0"
        >
          <span className="inline-flex items-center gap-2">
            {loading ? "Procesando…" : "Elegir este plan"}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </span>
        </button>
        {error && (
          <p className="text-xs text-destructive mb-4 break-words">{error}</p>
        )}

        <ul className="space-y-3 mt-6">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/20">
                <Check className="w-3 h-3 text-primary" />
              </div>
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
