"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Extra = { key: string; label: string; enabled: boolean }

export function CustomPlanForm({
  orgId,
  initial,
}: {
  orgId: string
  initial?: {
    display_name: string
    base_price_ars: number
    discount_percent: number
    discount_ends_at: string | null
    features: { extras: Extra[] }
    limits: Record<string, number>
    billing_method: "MP" | "MANUAL"
    notes: string | null
  }
}) {
  const router = useRouter()
  const isEdit = !!initial
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "")
  const [basePrice, setBasePrice] = useState(String(initial?.base_price_ars ?? ""))
  const [discountPct, setDiscountPct] = useState(String(initial?.discount_percent ?? 0))
  const [discountMonths, setDiscountMonths] = useState("0")
  // 2026-05-18 (Tomi, caso VICO): fecha exacta de fin del descuento (override
  // del cálculo automático now()+meses). Vacío = usar duración en meses.
  const [discountEndsAt, setDiscountEndsAt] = useState<string>(
    initial?.discount_ends_at ? initial.discount_ends_at.slice(0, 10) : ""
  )
  // 2026-05-18: días que MP espera antes del primer cobro. Útil cuando el
  // cliente ya pagó el primer mes por transferencia y queremos diferir el
  // primer cobro automático hasta una fecha específica.
  const [freeTrialDays, setFreeTrialDays] = useState<string>("0")
  const [billingMethod, setBillingMethod] = useState<"MP" | "MANUAL">(
    initial?.billing_method ?? "MP"
  )
  const [extras, setExtras] = useState<Extra[]>(initial?.features.extras ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ checkout_url?: string; error?: string } | null>(null)

  // Validación client-side espejo del backend para evitar 400 opacos.
  // El POST en /api/admin/orgs/[id]/custom-plan exige:
  //   - display_name truthy (no espacios)
  //   - base_price_ars > 0
  //   - discount_percent ∈ [0, 100]
  //   - si discount > 0 → discount_duration_months > 0
  function validate(): string | null {
    const dn = displayName.trim()
    if (!dn) return "Display name requerido"
    const price = Number(basePrice)
    if (!Number.isFinite(price) || price <= 0) return "Precio base ARS debe ser > 0"
    const disc = Number(discountPct)
    if (!Number.isFinite(disc) || disc < 0 || disc > 100)
      return "Descuento % debe estar entre 0 y 100"
    if (disc > 0) {
      // Si especificó fecha de fin → no requiere meses
      if (discountEndsAt) {
        const parsed = new Date(discountEndsAt)
        if (Number.isNaN(parsed.getTime())) {
          return "Fecha de fin del descuento inválida"
        }
        if (parsed.getTime() < Date.now()) {
          return "Fecha de fin del descuento debe ser futura"
        }
      } else {
        const months = Number(discountMonths)
        if (!Number.isFinite(months) || months <= 0)
          return "Si hay descuento, ingresá fecha de fin O duración (meses)"
        if (months > 24) return "Duración máxima 24 meses"
      }
    }
    const trialDays = Number(freeTrialDays)
    if (!Number.isFinite(trialDays) || trialDays < 0) {
      return "Días de trial debe ser >= 0"
    }
    if (trialDays > 365) {
      return "Máximo 365 días de trial"
    }
    return null
  }

  const clientValidationError = !isEdit ? validate() : null

  async function submit() {
    const err = validate()
    if (err) {
      setResult({ error: err })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      const method = isEdit ? "PATCH" : "POST"
      const trialDays = Number(freeTrialDays)
      const res = await fetch(`/api/admin/orgs/${orgId}/custom-plan`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          base_price_ars: Number(basePrice),
          discount_percent: Number(discountPct),
          discount_duration_months: Number(discountMonths),
          // Si el admin pasó fecha exacta, mandala (sobreescribe el cálculo automático)
          discount_ends_at: discountEndsAt
            ? new Date(discountEndsAt).toISOString()
            : undefined,
          free_trial_days: trialDays > 0 ? Math.floor(trialDays) : undefined,
          features: { extras },
          billing_method: billingMethod,
          notes: notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ error: data.error ?? res.statusText })
      } else {
        setResult({ checkout_url: data.checkout_url ?? undefined })
        // NO refrescar el router: así el link queda visible hasta que el usuario navegue manualmente
      }
    } finally {
      setSubmitting(false)
    }
  }

  function addExtra() {
    setExtras([...extras, { key: `misc_${Date.now()}`, label: "", enabled: true }])
  }
  function removeExtra(i: number) {
    setExtras(extras.filter((_, idx) => idx !== i))
  }
  function updateExtra(i: number, patch: Partial<Extra>) {
    setExtras(extras.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">{isEdit ? "Editar plan custom" : "Crear plan custom"}</h2>

      <label className="block text-sm">
        <span className="text-muted-foreground">Display name</span>
        <input
          className="w-full border rounded px-2 py-1 bg-background"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enterprise Custom Agencia X"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Precio base ARS/mes</span>
          <input
            type="text"
            inputMode="decimal"
            className="w-full border rounded px-2 py-1 bg-background"
            value={basePrice}
            onChange={(e) => {
              const raw = e.target.value.replace(",", ".")
              if (raw === "" || /^\d*\.?\d*$/.test(raw)) setBasePrice(raw)
            }}
            placeholder="719000"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Método de pago</span>
          <select
            className="w-full border rounded px-2 py-1 bg-background"
            value={billingMethod}
            onChange={(e) => setBillingMethod(e.target.value as "MP" | "MANUAL")}
          >
            <option value="MP">MercadoPago (recomendado)</option>
            <option value="MANUAL">Manual (transferencia/factura A)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Descuento %</span>
          <input
            type="text"
            inputMode="decimal"
            className="w-full border rounded px-2 py-1 bg-background"
            value={discountPct}
            onChange={(e) => {
              const raw = e.target.value.replace(",", ".")
              if (raw === "" || /^\d*\.?\d*$/.test(raw)) setDiscountPct(raw)
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Duración descuento (meses)</span>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={discountMonths}
            onChange={(e) => setDiscountMonths(e.target.value)}
            min={0}
            max={24}
            disabled={!!discountEndsAt}
          />
        </label>
      </div>

      {/* 2026-05-18 (caso VICO): permitir override de la fecha exacta del fin
          del descuento. Útil para clientes que ya pagaron offline y el
          descuento debe contar desde la fecha de vencimiento del periodo
          ya pagado, no desde la fecha de creación del custom_plan. */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">
            Fecha exacta fin descuento (opcional)
          </span>
          <input
            type="date"
            className="w-full border rounded px-2 py-1 bg-background"
            value={discountEndsAt}
            onChange={(e) => setDiscountEndsAt(e.target.value)}
          />
          <span className="text-[10px] text-muted-foreground">
            Si la completás, sobreescribe el cálculo de "duración meses".
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">
            Días hasta primer cobro MP (opcional)
          </span>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={freeTrialDays}
            onChange={(e) => setFreeTrialDays(e.target.value)}
            min={0}
            max={365}
            disabled={billingMethod !== "MP"}
          />
          <span className="text-[10px] text-muted-foreground">
            {billingMethod === "MP"
              ? "Si el cliente ya pagó offline, poné los días hasta que vence ese mes."
              : "Solo aplica si billing = MP."}
          </span>
        </label>
      </div>

      <div className="text-sm">
        <div className="text-muted-foreground mb-1">Features extras acordadas (aparte del Enterprise base)</div>
        <div className="space-y-1">
          {extras.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="flex-1 border rounded px-2 py-1 bg-background text-sm"
                value={e.label}
                onChange={(ev) => updateExtra(i, { label: ev.target.value })}
                placeholder="Ej. Bridge Manychat → Callbell dedicado"
              />
              <input
                className="w-40 border rounded px-2 py-1 bg-background text-xs font-mono"
                value={e.key}
                onChange={(ev) => updateExtra(i, { key: ev.target.value })}
                placeholder="key_tecnica"
              />
              <input
                type="checkbox"
                checked={e.enabled}
                onChange={(ev) => updateExtra(i, { enabled: ev.target.checked })}
              />
              <button
                onClick={() => removeExtra(i)}
                className="text-xs text-destructive hover:underline"
              >
                Borrar
              </button>
            </div>
          ))}
          <button onClick={addExtra} className="text-xs text-primary hover:underline">
            + Agregar feature extra
          </button>
        </div>
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground">Notas internas</span>
        <textarea
          className="w-full border rounded px-2 py-1 bg-background text-sm"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Cerrado por WA 22/04, referido de X"
        />
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={submit}
          disabled={submitting || !!clientValidationError}
          title={clientValidationError ?? ""}
          className="text-sm px-3 py-1 rounded bg-primary text-white disabled:opacity-50"
        >
          {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear plan + generar checkout"}
        </button>
        {clientValidationError && (
          <span className="text-xs text-muted-foreground">{clientValidationError}</span>
        )}
        {result?.error && <span className="text-xs text-destructive">{result.error}</span>}
      </div>

      {result?.checkout_url && (
        <div className="border border-success bg-success/5 dark:bg-success/10 rounded p-3 text-sm">
          <div className="font-semibold mb-1">Checkout URL generado:</div>
          <code className="block break-all text-xs bg-background px-2 py-1 rounded">
            {result.checkout_url}
          </code>
          <div className="text-xs text-muted-foreground mt-1">
            Mandale este link al cliente por WhatsApp. Al pagar, MP dispara webhook y la org pasa a ACTIVE.
          </div>
        </div>
      )}
    </div>
  )
}
