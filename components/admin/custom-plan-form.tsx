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
  const [billingMethod, setBillingMethod] = useState<"MP" | "MANUAL">(
    initial?.billing_method ?? "MP"
  )
  const [extras, setExtras] = useState<Extra[]>(initial?.features.extras ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ checkout_url?: string; error?: string } | null>(null)

  async function submit() {
    setSubmitting(true)
    setResult(null)
    try {
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(`/api/admin/orgs/${orgId}/custom-plan`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          base_price_ars: Number(basePrice),
          discount_percent: Number(discountPct),
          discount_duration_months: Number(discountMonths),
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
        router.refresh()
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
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
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
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
            min={0}
            max={100}
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
          />
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
                className="text-xs text-red-600 hover:underline"
              >
                Borrar
              </button>
            </div>
          ))}
          <button onClick={addExtra} className="text-xs text-blue-600 hover:underline">
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
          disabled={submitting}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear plan + generar checkout"}
        </button>
        {result?.error && <span className="text-xs text-red-600">{result.error}</span>}
      </div>

      {result?.checkout_url && (
        <div className="border border-green-500 bg-green-50 dark:bg-green-900/10 rounded p-3 text-sm">
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
